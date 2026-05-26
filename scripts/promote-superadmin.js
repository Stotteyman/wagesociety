// scripts/promote-superadmin.js
// Promotes a user to superadmin the Supabase-native way (never shipped to client).
// Looks up auth.users UUID for the given email, then upserts member_profiles with
// external_auth_id set and role='superadmin'.
//
// Usage:  node scripts/promote-superadmin.js [email]
// Env:    DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');

const email = (process.argv[2] || 'stotteyman@gmail.com').toLowerCase().trim();

const SUPABASE_URL     = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL     = process.env.DATABASE_URL;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required');
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL env var is required');
  process.exit(1);
}

async function main() {
  // 1. Look up the auth.users UUID via Supabase Admin API
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    console.error('Supabase admin.listUsers error:', error.message);
    process.exit(1);
  }

  const authUser = users.find(u => u.email?.toLowerCase() === email);
  if (!authUser) {
    console.error(`No Supabase auth user found for ${email}`);
    if (users.length) {
      console.log('Known users:', users.slice(0, 10).map(u => u.email).join(', '));
    }
    process.exit(1);
  }

  console.log(`Found Supabase auth user: ${authUser.email} (id: ${authUser.id})`);

  // 2. Upsert member_profiles — set external_auth_id + role=superadmin
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    // Derive a safe fallback username from the email local part
    const fallbackUsername = email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '');

    const result = await client.query(
      `INSERT INTO member_profiles (email, username, display_name, external_auth_id, role)
       VALUES ($1, $2, $3, $4, 'superadmin')
       ON CONFLICT (email) DO UPDATE
         SET external_auth_id = EXCLUDED.external_auth_id,
             role = 'superadmin',
             updated_at = NOW()
       RETURNING email, role, external_auth_id, username`,
      [email, fallbackUsername, fallbackUsername, authUser.id]
    );

    const row = result.rows[0];
    console.log('');
    console.log('✓ member_profiles updated:');
    console.log(`  email:            ${row.email}`);
    console.log(`  username:         ${row.username}`);
    console.log(`  role:             ${row.role}`);
    console.log(`  external_auth_id: ${row.external_auth_id}`);
    console.log('');
    console.log('Superadmin promotion complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
