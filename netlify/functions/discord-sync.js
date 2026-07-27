// POST /api/discord-sync — assigns the caller's Discord tier role via the bot.
// Uses the user's own token to get their sync plan (ws_my_discord_sync), then
// applies it with DISCORD_BOT_TOKEN. No service key needed for self-sync.
const { json } = require('./_auth');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const BOT = process.env.DISCORD_BOT_TOKEN;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json(401, { error: 'Not authenticated' });
  if (!BOT) return json(500, { error: 'Discord bot not configured' });

  // 1) sync plan as the user
  const planRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ws_my_discord_sync`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const plan = await planRes.json().catch(() => ({}));
  if (!planRes.ok) return json(400, { error: plan.message || 'plan_failed' });
  if (!plan.ok) return json(200, { synced: false, reason: plan.reason });

  // 2) apply with the bot token
  const base = `https://discord.com/api/v10/guilds/${plan.guild_id}/members/${plan.discord_id}`;
  const H = { Authorization: `Bot ${BOT}`, 'Content-Type': 'application/json' };
  const out = { synced: true, tier: plan.tier, added: null, removed: [] };

  if (plan.add_role_id) {
    const r = await fetch(`${base}/roles/${plan.add_role_id}`, { method: 'PUT', headers: H });
    out.added = r.ok ? plan.add_role_id : `err_${r.status}`;
  }
  for (const rid of plan.remove_role_ids || []) {
    const r = await fetch(`${base}/roles/${rid}`, { method: 'DELETE', headers: H });
    if (r.ok) out.removed.push(rid);
  }
  return json(200, out);
};
