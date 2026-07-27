// POST /api/kick-link { code, code_verifier, redirect_uri } + user JWT.
// Exchanges the Kick OAuth code (PKCE), fetches the Kick user, stores the link.
const { json } = require('./_auth');

const CLIENT_ID = process.env.KICK_CLIENT_ID || process.env.VITE_KICK_CLIENT_ID;
const CLIENT_SECRET = process.env.KICK_CLIENT_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const TOKEN_URL = 'https://id.kick.com/oauth/token';
const USER_URL = 'https://api.kick.com/public/v1/users';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json(401, { error: 'Not authenticated' });
  if (!CLIENT_ID || !CLIENT_SECRET) return json(500, { error: 'Kick OAuth not configured (KICK_CLIENT_ID / KICK_CLIENT_SECRET)' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad body' }); }
  const { code, code_verifier, redirect_uri } = body;
  if (!code || !code_verifier || !redirect_uri) return json(400, { error: 'code, code_verifier, redirect_uri required' });

  // 1) exchange code → token (creds in body per Kick docs)
  const tokRes = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri, code_verifier }),
  });
  const tok = await tokRes.json().catch(() => ({}));
  if (!tokRes.ok || !tok.access_token) return json(400, { error: 'kick_token_failed', detail: tok.error || tokRes.status });

  // 2) fetch Kick user (wrapped in { data: [...] })
  const uRes = await fetch(USER_URL, { headers: { Authorization: `Bearer ${tok.access_token}` } });
  const uBody = await uRes.json().catch(() => ({}));
  const ku = (uBody.data && uBody.data[0]) || uBody;
  if (!ku || !(ku.user_id || ku.id)) return json(400, { error: 'kick_user_fetch_failed' });
  const external_id = String(ku.user_id || ku.id);
  const username = ku.name || ku.username || ku.slug;
  const avatar = ku.profile_pic || ku.profile_picture || null;
  const display = ku.display_name || ku.name || username;

  // 3) store as the user via RPC
  const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ws_link_kick`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_external_id: external_id, p_username: username, p_display_name: display, p_avatar_url: avatar }),
  });
  const stored = await rpcRes.json().catch(() => ({}));
  if (!rpcRes.ok) return json(400, { error: stored.message || 'store_failed' });
  return json(200, { ok: true, username });
};
