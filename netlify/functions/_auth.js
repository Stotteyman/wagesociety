// netlify/functions/_auth.js — shared helper (NOT an endpoint).
// Service-role Supabase client bound to the `wagesociety` schema + role ladder.
const { createClient } = require('@supabase/supabase-js');

const SCHEMA = process.env.SUPABASE_SCHEMA || 'wagesociety';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// Netlify bundles Functions for nodejs20.x, and `globalThis.WebSocket` only arrived in
// Node 22. createClient() always builds a RealtimeClient, and realtime-js THROWS from
// that constructor when it finds no WebSocket rather than degrading — so every function
// in this directory dies before running a line of its own logic, even though none of
// them use realtime.
//
// It never reproduces locally (dev runs Node 22+), and the failure surfaces as whatever
// the caller happens to be doing. It was found here by posting a correctly-signed event
// to the live Stripe webhook: signature verification passed, then the handler returned
// 502 "Node.js detected but native WebSocket not found" — meaning no subscription event
// could ever have been recorded.
//
// Passing the transport explicitly is preferred over pinning the runtime: it works on
// every Node version and doesn't depend on a host default that can change under us.
const REALTIME_TRANSPORT =
  typeof globalThis.WebSocket !== 'undefined' ? globalThis.WebSocket : require('ws');

/** Shared client options. Spread into every createClient call in this file. */
const CLIENT_BASE = {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: REALTIME_TRANSPORT },
};

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
    ...CLIENT_BASE,
    db: { schema: SCHEMA },
  });
}

// Client acting AS the signed-in user, so RLS and auth.uid() apply. Use this
// whenever a decision must not be fooled by what the client claims — entitlement
// checks in particular, which the service-role client would happily bypass.
function getUserClient(token) {
  return createClient(SUPABASE_URL, ANON_KEY || SERVICE_KEY, {
    ...CLIENT_BASE,
    global: { headers: { Authorization: `Bearer ${token}` } },
    db: { schema: SCHEMA },
  });
}

// Resolve the caller from the Bearer token → { user, role, token } or { user: null }.
async function getAuthContext(event) {
  const authz = event.headers.authorization || event.headers.Authorization || '';
  const token = authz.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { user: null, role: 'guest', token: null };

  const client = createClient(SUPABASE_URL, ANON_KEY || SERVICE_KEY, { ...CLIENT_BASE });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return { user: null, role: 'guest', token: null };

  const user = data.user;
  const email = (user.email || '').toLowerCase();
  if (SUPERADMIN_EMAILS.has(email)) return { user, role: 'superadmin', token };

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
  return { user, role, token };
}

function hasRole(current, required) {
  return (ROLE_LADDER[current] || 0) >= (ROLE_LADDER[required] || 0);
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

module.exports = {
  SCHEMA, isConfigured, getServiceClient, getUserClient,
  getAuthContext, hasRole, json, SUPERADMIN_EMAILS,
};
