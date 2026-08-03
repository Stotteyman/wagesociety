// POST /api/discord-staff-sync { action } — makes website access agree with Discord.
//
// The tier sync (discord-sync.js) has always pushed the website's tier out to Discord.
// This is the other direction and a different question: who is actually staff. The
// Discord server has carried Staff, Moderator and Director roles the whole time and the
// website knew nothing about any of them, so someone could be moderating the server and
// still be a plain member here.
//
// Actions:
//   preview   work out every change without writing anything
//   apply     the same pass, committed
//   user      one person, by user_id — used right after a role is changed by hand
//   badges    push badge roles OUT to Discord: a Founder on the website is a Founder
//             in the server. Additive only — see below.
//   badge_role  add or remove one badge role for one member; used by grant/revoke
//
// The mapping lives in wagesociety.discord_role_map and is edited in /admin → Staff.
// The rules about what may be overwritten live in ws_svc_apply_staff_role, not here:
// a role granted by hand is never undone by Discord, and a locked role is never touched
// at all. This function only decides *what Discord says*; the database decides what that
// is allowed to do.
const { getAuthContext, hasRole, json } = require('./_auth');

const BOT = process.env.DISCORD_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const API = 'https://discord.com/api/v10';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Honour retry_after. A fixed delay drops writes silently — see docs/AGENT_NOTES.md. */
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

const RANK = { staff: 2, manager: 3, admin: 4 };

const BASE = (guild, member) => '/guilds/' + guild + '/members/' + member;
const PATH_ROLES = '/roles/';
const PATH_SEP = ':';

/** The highest website role this member's Discord roles earn them, or null for none. */
function desiredRole(memberRoleIds, byRoleId) {
  let best = null;
  for (const rid of memberRoleIds || []) {
    const m = byRoleId.get(rid);
    if (m && (best === null || RANK[m.website_role] > RANK[best])) best = m.website_role;
  }
  return best;
}

function badgesFor(memberRoleIds, byRoleId) {
  const out = new Set();
  for (const rid of memberRoleIds || []) {
    const m = byRoleId.get(rid);
    if (m?.badge_slug) out.add(m.badge_slug);
  }
  return [...out];
}

/**
 * Every member of the guild, one page at a time. GET /members caps at 1000 per call and
 * pages on the highest id seen, so a server that outgrows one page still syncs whole.
 * Requires the GUILD_MEMBERS privileged intent to be enabled for the bot.
 */
async function fetchAllMembers(guildId) {
  const all = [];
  let after = '0';
  for (let page = 0; page < 20; page++) {
    const res = await discord(`/guilds/${guildId}/members?limit=1000&after=${after}`);
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Discord members: HTTP ${res.status} ${detail.slice(0, 200)}`);
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    after = batch[batch.length - 1]?.user?.id;
    if (!after || batch.length < 1000) break;
    await sleep(400);
  }
  return all;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!BOT || !SERVICE) return json(500, { error: 'Server not configured' });

  const ctx = await getAuthContext(event);
  if (!ctx.user) return json(401, { error: 'Not authenticated' });
  if (!hasRole(ctx.role, 'manager')) return json(403, { error: 'forbidden' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad body' }); }
  const action = body.action || 'preview';
  if (!['preview', 'apply', 'user', 'badges', 'badge_role'].includes(action)) {
    return json(400, { error: 'unknown action' });
  }

  /*
   * Badge roles run the opposite way to everything below: the website is the authority
   * and Discord follows.
   *
   * Additive by design. Nothing here removes a badge role from someone who no longer
   * qualifies, because badges are permanent honours and a reconciliation pass that gets
   * its input wrong once quietly strips Founder from the founders. Removal happens only
   * through 'badge_role' with add:false — one person, one role, and a decision somebody
   * just made in the console.
   */
  if (action === 'badges' || action === 'badge_role') {
    const sctx = await rpc('ws_svc_staff_sync_context');
    const guild = sctx?.guild_id;
    if (!guild) return json(400, { error: 'No Discord server is connected' });

    if (action === 'badge_role') {
      const { user_id, role_id, add } = body;
      if (!user_id || !role_id) return json(400, { error: 'user_id and role_id required' });
      // No Discord link is not a failure; there is simply nowhere to put the role.
      const discordId = (sctx.links || []).find((l) => l.user_id === user_id)?.discord_id;
      if (!discordId) return json(200, { ok: true, skipped: 'not_linked' });

      const path = BASE(guild, discordId) + PATH_ROLES + role_id;
      const r = await discord(path, { method: add === false ? 'DELETE' : 'PUT' });
      return json(200, { ok: r.ok, status: r.status, role_id, added: add !== false });
    }

    const targets = await rpc('ws_svc_badge_role_targets');
    if (!Array.isArray(targets)) {
      return json(500, { error: 'Could not read badge targets', detail: targets });
    }
    const out = [];
    for (const t of targets) {
      const row = { username: t.username, badges: t.badges, granted: [], failed: [] };
      for (const roleId of t.role_ids || []) {
        const path = BASE(guild, t.discord_id) + PATH_ROLES + roleId;
        const r = await discord(path, { method: 'PUT' });
        if (r.ok) row.granted.push(roleId);
        else row.failed.push(roleId + PATH_SEP + r.status);
        await sleep(350);
      }
      out.push(row);
    }
    return json(200, { ok: true, action, members: out.length, results: out });
  }

  const ctxRes = await rpc('ws_svc_staff_sync_context');
  // PostgREST answers a failed RPC with {code, message, hint} rather than throwing, and
  // that object has no guild_id — so without this the caller is told "no Discord server
  // is connected" when the real problem is a missing service key or a revoked grant.
  if (ctxRes?.code || ctxRes?.message) {
    return json(500, { error: `Could not read the sync context: ${ctxRes.message || ctxRes.code}` });
  }
  const guildId = ctxRes?.guild_id;
  const mappings = ctxRes?.mappings || [];
  const links = ctxRes?.links || [];

  if (!guildId) return json(400, { error: 'No Discord server is connected' });
  if (mappings.length === 0) {
    return json(200, {
      ok: true, action, guild_id: guildId, mapped_roles: 0, changes: [],
      // Not an error: an empty mapping is the state before anyone has set one up. Saying
      // so beats reporting "0 changes" as if everything already agreed.
      note: 'No Discord roles are mapped to website roles yet. Map one in the Staff tab first.',
    });
  }

  const byRoleId = new Map(mappings.map((m) => [m.role_id, m]));
  const wanted = action === 'user' ? links.filter((l) => l.user_id === body.user_id) : links;
  if (action === 'user' && wanted.length === 0) {
    return json(200, { ok: true, action, changes: [], note: 'That account has no Discord linked.' });
  }

  let members;
  try {
    // One member for the single-user path; the whole guild otherwise. Pulling 1000
    // members to look at one is the kind of thing that gets a bot rate-limited.
    if (action === 'user') {
      const res = await discord(`/guilds/${guildId}/members/${wanted[0].discord_id}`);
      if (res.status === 404) {
        return json(200, { ok: true, action, changes: [], note: 'That account is not in the Discord server.' });
      }
      if (!res.ok) throw new Error(`Discord member: HTTP ${res.status}`);
      members = [await res.json()];
    } else {
      members = await fetchAllMembers(guildId);
    }
  } catch (e) {
    // The usual cause is the GUILD_MEMBERS intent being off, which returns a plain 403
    // with no explanation of what the bot is missing.
    return json(502, {
      error: String(e.message || e),
      hint: 'Listing members needs the SERVER MEMBERS INTENT enabled on the bot in the Discord developer portal.',
    });
  }

  const rolesByDiscordId = new Map(members.map((m) => [m.user?.id, m.roles || []]));

  const changes = [];
  const dryRun = action === 'preview';
  for (const link of wanted) {
    const memberRoles = rolesByDiscordId.get(link.discord_id);
    // Not in the server at all. Leave them be rather than guessing a demotion from an
    // absence — someone can be missing because the bot's page ended, not because they left.
    if (!memberRoles) {
      changes.push({ email: link.email, username: link.username, action: 'skip', reason: 'not_in_guild' });
      continue;
    }
    const desired = desiredRole(memberRoles, byRoleId);
    const result = await rpc('ws_svc_apply_staff_role', {
      p_user_id: link.user_id, p_desired: desired, p_dry_run: dryRun,
    });
    const row = { username: link.username, ...result, discord_roles: memberRoles.length };

    // Badges are applied whenever the mapping says they are earned, not only when the
    // role changed. Keying them off a change meant anyone already holding the right role
    // never got the badge — which is everybody, on the second run onwards. The RPC is an
    // idempotent insert, so repeating it costs nothing.
    if (!dryRun && desired && result?.action !== 'skip') {
      const slugs = badgesFor(memberRoles, byRoleId);
      if (slugs.length) {
        const badged = await rpc('ws_svc_apply_role_badges', { p_user_id: link.user_id, p_slugs: slugs });
        if (badged?.added) row.badges_added = badged.added;
      }
    }
    changes.push(row);
  }

  const moved = changes.filter((c) => c.action === 'promote' || c.action === 'demote');
  return json(200, {
    ok: true,
    action,
    guild_id: guildId,
    mapped_roles: mappings.length,
    linked_accounts: wanted.length,
    guild_members: members.length,
    changed: moved.length,
    changes,
  });
};
