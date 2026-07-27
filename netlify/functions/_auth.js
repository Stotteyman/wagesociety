// netlify/functions/_auth.js — shared helper (NOT an endpoint).
// Service-role Supabase client bound to the `wagesociety` schema + role ladder.
const { createClient } = require('@supabase/supabase-js');

const SCHEMA = process.env.SUPABASE_SCHEMA || 'wagesociety';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// CEO allowlist — always superadmin regardless of DB rows.
const SUPERADMIN_EMAILS = new Set(['stotteyman@gmail.com', 'gggiddings@yahoo.com']);

const ROLE_LADDER = { guest: 0, member: 1, customer: 1, staff: 2, manager: 3, admin: 4, superadmin: 5 };

function isConfigured() {
  return Boolean(SUPABASE_URL && (SERVICE_KEY || ANON_KEY));
}

// Service-role client (bypasses RLS). Falls back to anon if service key absent —
// public views still work, but privileged writes will fail against RLS.
function getServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY || ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: SCHEMA },
  });
}

// Resolve the caller from the Bearer token → { user, role } or { user: null }.
async function getAuthContext(event) {
  const authz = event.headers.authorization || event.headers.Authorization || '';
  const token = authz.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { user: null, role: 'guest' };

  const client = createClient(SUPABASE_URL, ANON_KEY || SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return { user: null, role: 'guest' };

  const user = data.user;
  const email = (user.email || '').toLowerCase();
  if (SUPERADMIN_EMAILS.has(email)) return { user, role: 'superadmin' };

  // Highest role from wagesociety.user_roles → roles
  let role = 'member';
  try {
    const svc = getServiceClient();
    const { data: rows } = await svc
      .from('user_roles')
      .select('roles(name, priority)')
      .eq('user_id', user.id);
    if (rows && rows.length) {
      role = rows
        .map((r) => r.roles)
        .filter(Boolean)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))[0]?.name || role;
    }
  } catch (_) { /* default member */ }
  return { user, role };
}

function hasRole(current, required) {
  return (ROLE_LADDER[current] || 0) >= (ROLE_LADDER[required] || 0);
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

module.exports = { SCHEMA, isConfigured, getServiceClient, getAuthContext, hasRole, json, SUPERADMIN_EMAILS };
