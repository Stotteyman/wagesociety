// scripts/seed-root-admin.js — Seed the root admin account on startup.
// Idempotent: safe to call on every migrate run.
// Runs via: node scripts/seed-root-admin.js
// Or imported by migrate.js after the must_change_password migration applies.
//
// Requires SUPABASE_SERVICE_ROLE_KEY in env to create auth.users row.
// If missing, logs a warning and only seeds the member_profiles row (auth user
// must be created manually in Supabase dashboard).
require('../db/index'); // ensure env loaded

const ROOT_EMAIL = 'root@wagesociety.com';
const ROOT_PASSWORD = 'admin';
const ROOT_USERNAME = 'root';

async function seedRootAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const { pool } = require('../db/index');

  // Always upsert the member_profiles row (works without Supabase credentials)
  await pool.query(
    `INSERT INTO member_profiles (email, username, role, must_change_password, created_at, updated_at)
     VALUES ($1, $2, 'superadmin', TRUE, NOW(), NOW())
     ON CONFLICT (email) DO UPDATE SET
       username = EXCLUDED.username,
       role = 'superadmin',
       must_change_password = TRUE,
       updated_at = NOW()`,
    [ROOT_EMAIL, ROOT_USERNAME]
  );
  console.log('[seed-root] member_profiles upserted: username=root, role=superadmin, must_change_password=TRUE');

  // Ensure FREE membership entry exists (idempotent)
  await pool.query(
    `INSERT INTO user_memberships (email, plan_slug, status, current_period_start, current_period_end)
     VALUES ($1, 'free', 'active', NOW(), NOW() + INTERVAL '1 year')
     ON CONFLICT (email, plan_slug) DO NOTHING`,
    [ROOT_EMAIL]
  ).catch(() => {});

  // Create Supabase auth user only if service role key is available
  if (!serviceRoleKey) {
    console.log('[seed-root] ⚠️  SUPABASE_SERVICE_ROLE_KEY not set in env.');
    console.log('[seed-root]   → member_profiles row seeded (middleware will work).');
    console.log('[seed-root]   → auth.users row NOT created — set SUPABASE_SERVICE_ROLE_KEY in Render dashboard to enable.');
    console.log('[seed-root]   → Get the key from: https://supabase.com/dashboard → Project Settings → API → service_role key');
    return;
  }

  const { createClient } = require('@supabase/supabase-js');
  const ws = require('ws');
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  });

  // Check if root auth user already exists
  const { data: users } = await supabaseAdmin.auth.admin.listUsers();
  const existingUser = users?.users?.find(u => u.email === ROOT_EMAIL);

  if (existingUser) {
    console.log('[seed-root] auth.users row already exists (ID:', existingUser.id, ')');
  } else {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: ROOT_EMAIL,
      password: ROOT_PASSWORD,
      email_confirm: true,
    });
    if (error) {
      console.error('[seed-root] Failed to create root auth user:', error.message);
      console.log('[seed-root]   member_profiles is seeded — auth user must be created manually in Supabase dashboard.');
      return;
    }
    console.log('[seed-root] Created root auth user (ID:', data.user.id, ')');
  }

  console.log('[seed-root] Root admin seeding complete.');
}

seedRootAdmin().catch(err => {
  console.error('[seed-root] Seeding error:', err.message);
  // Do not exit(1) — let migrate.js continue even if seeding fails
});