// POST /api/discord-join { provider_token } + user JWT.
// Adds the signed-in user to the official W.A.G.E. Society Discord server.
//
// Discord's "add guild member" endpoint takes the USER's OAuth access token in the
// body and the BOT's token in the header. The user token must carry the
// `guilds.join` scope, which is requested when Discord is linked in Settings.
//
// 201 = added, 204 = already a member. Both are success from our side.
const { json } = require('./_auth');

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const API = 'https://discord.com/api/v10';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const jwt = (event.headers.authorization || event.headers.Authorization || '')
    .replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return json(401, { error: 'Not authenticated' });

  if (!BOT_TOKEN) {
    return json(500, {
      error: 'not_configured',
      detail: 'DISCORD_BOT_TOKEN is missing. Note that a blank value in .env.local shadows the real one in Netlify.',
    });
  }
  if (!GUILD_ID) {
    return json(500, { error: 'not_configured', detail: 'DISCORD_GUILD_ID is not set.' });
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad body' }); }
  const providerToken = body.provider_token;
  if (!providerToken) {
    return json(400, {
      error: 'no_provider_token',
      detail: 'Reconnect Discord from Settings — the permission to add you is only handed over during sign-in.',
    });
  }

  // Who is this token for?
  const meRes = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${providerToken}` } });
  const me = await meRes.json().catch(() => ({}));
  if (!meRes.ok || !me.id) {
    return json(400, {
      error: 'discord_identify_failed',
      detail: 'That Discord session expired. Reconnect Discord from Settings.',
    });
  }

  const addRes = await fetch(`${API}/guilds/${GUILD_ID}/members/${me.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: providerToken }),
  });

  if (addRes.status === 201) return json(200, { ok: true, joined: true, username: me.username });
  if (addRes.status === 204) return json(200, { ok: true, joined: false, username: me.username });

  const err = await addRes.json().catch(() => ({}));
  if (addRes.status === 403) {
    return json(400, {
      error: 'bot_permission',
      detail: 'The bot cannot add members. Give it the "Create Invite" permission in the server, and make sure its role is above the ones it assigns.',
    });
  }
  return json(400, { error: 'discord_join_failed', detail: err.message || `HTTP ${addRes.status}` });
};
