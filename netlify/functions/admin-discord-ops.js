// POST /api/admin-discord-ops { action, ... } — operational tools for the Discord gate.
//
// Actions:
//   resync_all      re-apply tier roles for every linked account
//   restore_member  hand a stripped member their roles back without them verifying
//   test_message    post to a channel to prove the bot can still write
//
// Manager-gated. Every action writes an audit record, per the control-center spec.
const { getAuthContext, hasRole, json, getServiceClient } = require('./_auth');

const BOT = process.env.DISCORD_BOT_TOKEN;
const GUILD = process.env.DISCORD_GUILD_ID;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const API = 'https://discord.com/api/v10';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Discord's role endpoints rate-limit aggressively. A fixed delay is not enough —
 * a bulk pass silently drops writes and leaves the database claiming work that never
 * landed, so honour retry_after instead of guessing.
 */
async function discord(path, init = {}, attempt = 0) {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bot ${BOT}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (res.status === 429 && attempt < 6) {
    const body = await res.json().catch(() => ({}));
    await sleep(Math.ceil((body.retry_after ?? 2) * 1000) + 300);
    return discord(path, init, attempt + 1);
  }
  return res;
}

const rpc = (name, body) =>
  fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  }).then((r) => r.json());

async function audit(actor, action, detail) {
  const svc = getServiceClient();
  await svc.from('admin_audit_log').insert({ actor, action, detail }).then(() => {}, () => {});
}

/** Apply one sync plan. Returns what actually changed on Discord. */
async function applyPlan(plan) {
  const base = `/guilds/${plan.guild_id}/members/${plan.discord_id}`;
  const out = { discord_id: plan.discord_id, tier: plan.tier, added: null, restored: [], removed: [], errors: [] };

  if (plan.add_role_id) {
    const r = await discord(`${base}/roles/${plan.add_role_id}`, { method: 'PUT' });
    if (r.ok) out.added = plan.add_role_id;
    else out.errors.push(`add ${plan.add_role_id}: HTTP ${r.status}`);
    await sleep(900);
  }
  for (const rid of plan.restore_role_ids || []) {
    const r = await discord(`${base}/roles/${rid}`, { method: 'PUT' });
    if (r.ok) out.restored.push(rid); else out.errors.push(`restore ${rid}: HTTP ${r.status}`);
    await sleep(900);
  }
  for (const rid of plan.remove_role_ids || []) {
    const r = await discord(`${base}/roles/${rid}`, { method: 'DELETE' });
    if (r.ok) out.removed.push(rid);
    await sleep(900);
  }
  return out;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const { user, role } = await getAuthContext(event);
  if (!user) return json(401, { error: 'Not authenticated' });
  if (!hasRole(role, 'manager')) return json(403, { error: 'forbidden' });
  if (!BOT || !GUILD) return json(500, { error: 'not_configured', detail: 'Discord bot token or guild id is missing.' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad body' }); }
  const actor = (user.email || 'unknown').toLowerCase();

  if (body.action === 'test_message') {
    const channel = body.channel_id;
    if (!channel) return json(400, { error: 'channel_id required' });
    const r = await discord(`/channels/${channel}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: `Bot connectivity test from the W.A.G.E. admin panel — requested by ${actor}.` }),
    });
    const out = await r.json().catch(() => ({}));
    await audit(actor, 'discord.test_message', { channel, ok: r.ok, status: r.status });
    return r.ok
      ? json(200, { ok: true, message_id: out.id })
      : json(400, { error: 'send_failed', detail: out.message || `HTTP ${r.status}` });
  }

  if (body.action === 'restore_member') {
    const discordId = body.discord_id;
    if (!discordId) return json(400, { error: 'discord_id required' });

    const svc = getServiceClient();
    const { data: snap } = await svc
      .from('discord_role_snapshot')
      .select('discord_id, username, stripped_role_ids, stripped_at, restored_at')
      .eq('discord_id', discordId)
      .maybeSingle();
    if (!snap) return json(404, { error: 'no_snapshot', detail: 'No saved roles for that Discord account.' });
    if (!snap.stripped_at) return json(400, { error: 'not_stripped', detail: 'Nothing was taken from this account.' });

    const restored = [];
    const errors = [];
    for (const rid of snap.stripped_role_ids || []) {
      const r = await discord(`/guilds/${GUILD}/members/${discordId}/roles/${rid}`, { method: 'PUT' });
      if (r.ok) restored.push(rid); else errors.push(`${rid}: HTTP ${r.status}`);
      await sleep(900);
    }
    // Only mark it done when every role actually landed.
    if (!errors.length) {
      await svc.from('discord_role_snapshot')
        .update({ restored_at: new Date().toISOString() })
        .eq('discord_id', discordId);
    }
    await audit(actor, 'discord.restore_member', { discord_id: discordId, username: snap.username, restored, errors });
    return json(200, { ok: !errors.length, username: snap.username, restored, errors });
  }

  if (body.action === 'resync_all') {
    const svc = getServiceClient();
    const { data: links } = await svc.from('discord_links').select('user_id, discord_id');
    const results = [];
    for (const l of links || []) {
      const plan = await rpc('ws_svc_discord_sync', { p_user_id: l.user_id });
      if (!plan?.ok) { results.push({ discord_id: l.discord_id, skipped: plan?.reason || 'no_plan' }); continue; }
      results.push(await applyPlan(plan));
    }
    const errored = results.filter((r) => r.errors?.length).length;
    await audit(actor, 'discord.resync_all', { count: results.length, errored });
    return json(200, { ok: true, synced: results.length, errored, results });
  }

  return json(400, { error: 'unknown_action' });
};
