// POST /api/discord-sync-user { user_id } — admin-triggered role sync for another
// user. Verifies the caller is admin (their JWT), then uses the service key to get
// the target's sync plan and applies it with the bot token.
const { json } = require('./_auth');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const BOT = process.env.DISCORD_BOT_TOKEN;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json(401, { error: 'Not authenticated' });
  if (!SERVICE || !BOT) return json(500, { error: 'Server not configured' });

  // Verify caller is staff/admin via their own token
  const roleRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ws_current_role`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}',
  });
  const role = await roleRes.json().catch(() => null);
  if (!['manager', 'admin', 'superadmin'].includes(role)) return json(403, { error: 'forbidden' });

  let userId;
  try { userId = JSON.parse(event.body || '{}').user_id; } catch { return json(400, { error: 'bad body' }); }
  if (!userId) return json(400, { error: 'user_id required' });

  // Sync plan via service key
  const planRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ws_svc_discord_sync`, {
    method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_user_id: userId }),
  });
  const plan = await planRes.json().catch(() => ({}));
  if (!plan.ok) return json(200, { synced: false, reason: plan.reason || 'no_plan' });

  const base = `https://discord.com/api/v10/guilds/${plan.guild_id}/members/${plan.discord_id}`;
  const H = { Authorization: `Bot ${BOT}`, 'Content-Type': 'application/json' };
  const out = { synced: true, tier: plan.tier, removed: [], restored: [] };
  if (plan.add_role_id) { const r = await fetch(`${base}/roles/${plan.add_role_id}`, { method: 'PUT', headers: H }); out.added = r.ok ? plan.add_role_id : `err_${r.status}`; }

  // Same lockdown restore as the self-serve path, marked done only on a clean sweep.
  const restore = plan.restore_role_ids || [];
  let allRestored = true;
  for (const rid of restore) {
    const r = await fetch(`${base}/roles/${rid}`, { method: 'PUT', headers: H });
    if (r.ok) out.restored.push(rid); else allRestored = false;
  }
  if (restore.length && allRestored) {
    await fetch(`${SUPABASE_URL}/rest/v1/discord_role_snapshot?discord_id=eq.${plan.discord_id}&restored_at=is.null`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json',
        'Content-Profile': 'wagesociety', Prefer: 'return=minimal',
      },
      body: JSON.stringify({ restored_at: new Date().toISOString(), restored_to: userId }),
    }).catch(() => {});
  }

  for (const rid of plan.remove_role_ids || []) { const r = await fetch(`${base}/roles/${rid}`, { method: 'DELETE', headers: H }); if (r.ok) out.removed.push(rid); }
  return json(200, out);
};
