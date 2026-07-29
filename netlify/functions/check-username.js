// GET /api/check-username?username=foo — availability check. Public.
//
// Defers to ws_username_status so this endpoint enforces exactly the same rule as
// signup, the settings form and the admin override — including the length minimum and
// the reserved list, which a regex duplicated here would silently miss.
//
// Called over raw REST rather than the shared service client: that client is bound to
// the `wagesociety` schema, and the ws_* functions live in `public`.
const { json, isConfigured } = require('./_auth');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (!isConfigured()) return json(500, { error: 'Supabase not configured' });
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const username = String(event.queryStringParameters?.username || '').toLowerCase().trim();

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ws_username_status`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_username: username, p_for_user: null }),
  });
  if (!res.ok) return json(500, { error: `status check failed: HTTP ${res.status}` });

  const status = (await res.json()) || {};
  return json(200, { available: Boolean(status.ok), reason: status.reason || null });
};
