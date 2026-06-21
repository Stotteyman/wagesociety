// lib/discord-sync.js — Discord role sync engine.
// Owns: syncing website staff role + subscription tier → Discord guild roles via the bot token.
// Does NOT own: OAuth flow, token storage, route handling.
//
// Role system:
//   Staff roles (non-cumulative — user gets exactly ONE):
//     SUPERADMIN → Director  (1171230293210959872)
//     ADMIN      → Admin     (1160653381543661609)
//     MODERATOR  → Moderator (1171231031857258587)
//     HELPER     → Helper    (1509868681369227345)
//     MEMBER     → Member    (1508994738207064184)
//   Subscription roles (cumulative — Pro gets Member + Creator + Pro):
//     Free     → Member     (1508994738207064184)
//     Creator  → Creator    (1508994738924027945)
//     Pro      → Pro        (1508994740358484010)
//     Elite    → Elite      (managed — bot creates if missing)
//     Unlimited→ Unlimited   (managed — bot creates if missing)

const https = require('https');
const { getDiscordLinkByUserId, getUserEmailById, updateDiscordLink } = require('../db/discord');
const { getUserMembership } = require('../db/memberships');
const { pool } = require('../db/index');

const DISCORD_API = 'https://discord.com/api/v10';

// ── Staff role mapping (website role → Discord role ID) ─────────────────────
const STAFF_ROLE_MAP = {
  superadmin: '1171230293210959872',
  admin:     '1160653381543661609',
  moderator: '1171231031857258587',
  helper:    '1509868681369227345',
  member:    '1508994738207064184',
};

// ── Subscription tier roles (cumulative) ─────────────────────────────────────
// Map: tier slug → Discord role ID
// Pro means: Member + Creator + Pro (all three applied)
const TIER_ROLE_MAP = {
  free:     '1508994738207064184',
  creator:  '1508994738924027945',
  pro:      '1508994740358484010',
};

// Cumulative: each tier includes all lower tiers.
// Pro gets [Member, Creator, Pro]. Creator gets [Member, Creator].
// Free gets [Member].
const TIER_CUMULATIVE = {
  member:   ['1508994738207064184'],
  creator:  ['1508994738207064184', '1508994738924027945'],
  pro:      ['1508994738207064184', '1508994738924027945', '1508994740358484010'],
  elite:    ['1508994738207064184', '1508994738924027945', '1508994740358484010'],
  unlimited:['1508994738207064184', '1508994738924027945', '1508994740358484010'],
};

// Roles created + managed by the bot (Elite, Unlimited)
const BOT_MANAGED_ROLE_TYPES = ['elite', 'unlimited'];

const GUILD_ID = process.env.DISCORD_GUILD_ID || '1160158300168527895';

// ── Low-level HTTPS helper (Node built-in only) ──────────────────────────────
function discordRequest(method, path, botToken, body) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const { hostname, pathname } = new URL(DISCORD_API + path);
    const options = {
      hostname, path: pathname, method,
      headers: {
        Authorization: `Bot ${botToken}`,
        'User-Agent': 'WageOSBot/1.0',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', (err) => resolve({ status: 0, body: null, error: err.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

// Refresh a user's access token if expired.
async function refreshTokenIfNeeded(link) {
  if (!link.token_expires_at) return null;
  const expires = new Date(link.token_expires_at);
  if (expires > new Date()) return null;

  return new Promise((resolve) => {
    const body = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: link.refresh_token,
    }).toString();

    const options = {
      hostname: 'discord.com', path: '/api/oauth2/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.access_token) {
            resolve({
              access_token: parsed.access_token,
              refresh_token: parsed.refresh_token || link.refresh_token,
              token_expires_at: new Date(Date.now() + (parsed.expires_in || 604800) * 1000),
            });
          } else { resolve(null); }
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });
}

// ── syncRoles(userId) — primary export ────────────────────────────────────────
// Reads website staff role + subscription tier → computes expected Discord roles
// → syncs the guild member to match. Logs actions to discord_mod_actions.
async function syncRoles(userId) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    console.log(JSON.stringify({ event: 'sync_roles_skip', user_id: userId, reason: 'missing_bot_token' }));
    return { synced: false, reason: 'missing_bot_token' };
  }

  // Step 1: Get user's Discord link
  let link;
  try {
    link = await getDiscordLinkByUserId(userId);
  } catch (err) {
    return { synced: false, reason: 'db_error', error: err.message };
  }
  if (!link) {
    return { synced: false, reason: 'not_linked' };
  }

  // Step 2: Refresh user token if needed
  const refreshed = await refreshTokenIfNeeded(link);
  if (refreshed) {
    try {
      await updateDiscordLink(userId, {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        token_expires_at: refreshed.token_expires_at,
      });
      link.access_token = refreshed.access_token;
    } catch (_) {}
  }

  // Step 3: Get user's website staff role from DB
  let staffRole = 'member';
  try {
    const { rows } = await pool.query(
      'SELECT role FROM auth_users WHERE id = $1', [userId]
    );
    if (rows[0]?.role) staffRole = rows[0].role.toLowerCase();
  } catch (_) {}

  // Step 4: Get subscription tier from memberships
  let tier = 'free';
  try {
    const email = await getUserEmailById(userId);
    if (email) {
      const membership = await getUserMembership(email);
      if (membership?.plan_slug) tier = membership.plan_slug.toLowerCase();
    }
  } catch (_) {}

  const discordId = link.discord_id;

  // Step 5: Compute expected Discord roles
  const staffRoleId = STAFF_ROLE_MAP[staffRole] || STAFF_ROLE_MAP.member;

  // Build expected roles: staff role + cumulative subscription tiers
  const expectedSet = new Set([staffRoleId]);

  const subRoles = TIER_CUMULATIVE[tier] || TIER_CUMULATIVE.free;
  for (const rid of subRoles) expectedSet.add(rid);

  // For Elite/Unlimited, resolve bot-managed role IDs from DB or API
  if (tier === 'elite' || tier === 'unlimited') {
    const botManaged = await resolveBotManagedRoleId(botToken, GUILD_ID, tier);
    if (botManaged) expectedSet.add(botManaged);
  }

  const expectedRoles = [...expectedSet];

  // Step 6: Add user to guild (join) if not already a member
  const putRes = await discordRequest(
    'PUT',
    `/guilds/${GUILD_ID}/members/${discordId}`,
    botToken,
    { access_token: link.access_token, roles: expectedRoles }
  );

  if (putRes.status === 404) {
    // User not in guild and guilds.join scope not granted — can't join
    console.log(JSON.stringify({ event: 'sync_roles_not_in_guild', user_id: userId, discord_id: discordId }));
    return { synced: false, reason: 'not_in_guild', discord_id: discordId };
  }

  // Step 7: Get current member roles to know what's already applied
  const getRes = await discordRequest('GET', `/guilds/${GUILD_ID}/members/${discordId}`, botToken, null);
  if (getRes.status !== 200) {
    console.log(JSON.stringify({ event: 'sync_roles_get_member_failed', user_id: userId, status: getRes.status }));
    return { synced: false, reason: 'get_member_failed', status: getRes.status };
  }

  const currentRoles = getRes.body?.roles || [];

  // Step 8: Determine add/remove diff (only manage our known roles — don't touch other server roles)
  const knownRoleIds = [...new Set([
    ...Object.values(STAFF_ROLE_MAP),
    ...Object.values(TIER_ROLE_MAP),
  ])];

  const toAdd = expectedRoles.filter(id => !currentRoles.includes(id));
  const toRemove = currentRoles.filter(id => knownRoleIds.includes(id) && !expectedRoles.includes(id));

  // Step 9: Apply role changes
  let patchResult = { status: 200 };
  if (toAdd.length > 0 || toRemove.length > 0) {
    const finalRoles = [...new Set([...currentRoles.filter(id => !toRemove.includes(id)), ...toAdd])];
    patchResult = await discordRequest(
      'PATCH',
      `/guilds/${GUILD_ID}/members/${discordId}`,
      botToken,
      { roles: finalRoles }
    );
    console.log(JSON.stringify({
      event: 'sync_roles_patch',
      user_id: userId, discord_id: discordId,
      staff_role: staffRole, tier,
      added: toAdd, removed: toRemove, patch_status: patchResult.status
    }));

    // Log mod action for significant changes
    if (toAdd.length > 0 || toRemove.length > 0) {
      await logModAction(null, userId, 'role_sync', `staff=${staffRole} tier=${tier} added=${toAdd.join(',')} removed=${toRemove.join(',')}`).catch(() => {});
    }
  }

  // Step 10: Update last_synced_at
  try { await updateDiscordLink(userId, { last_synced_at: new Date() }); } catch (_) {}

  const success = patchResult.status >= 200 && patchResult.status < 300;
  return success
    ? { synced: true, staff_role: staffRole, tier, added: toAdd, removed: toRemove, discord_id: discordId }
    : { synced: false, reason: 'patch_failed', status: patchResult.status };
}

// Resolve the bot-managed role ID for Elite or Unlimited.
// First checks discord_managed_roles table, then fetches from API,
// then creates the role if missing.
async function resolveBotManagedRoleId(botToken, guildId, tier) {
  // Check DB first
  try {
    const { rows } = await pool.query(
      'SELECT discord_role_id FROM discord_managed_roles WHERE guild_id = $1 AND role_type = $2',
      [guildId, tier]
    );
    if (rows[0]?.discord_role_id) return rows[0].discord_role_id;
  } catch (_) {}

  // Fetch from Discord API
  const rolesRes = await discordRequest('GET', `/guilds/${guildId}/roles`, botToken, null);
  if (rolesRes.status !== 200 || !Array.isArray(rolesRes.body)) return null;

  const nameMap = { elite: 'Elite', unlimited: 'Unlimited' };
  const roleEntry = rolesRes.body.find(r => r.name === nameMap[tier]);
  if (roleEntry) {
    // Persist to DB
    try {
      await pool.query(
        `INSERT INTO discord_managed_roles (guild_id, role_type, role_name, discord_role_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (guild_id, role_type) DO UPDATE SET discord_role_id = $4`,
        [guildId, tier, nameMap[tier], roleEntry.id]
      );
    } catch (_) {}
    return roleEntry.id;
  }

  // Create if missing
  const colorMap = { elite: 10870393, unlimited: 15206668 }; // #a855f7 purple, #eab308 gold
  const createRes = await discordRequest('POST', `/guilds/${guildId}/roles`, botToken, {
    name: nameMap[tier],
    color: colorMap[tier],
    hoist: true,
    mentionable: true,
    permissions: '0',
  });

  if (createRes.status === 200 && createRes.body?.id) {
    const newId = createRes.body.id;
    try {
      await pool.query(
        `INSERT INTO discord_managed_roles (guild_id, role_type, role_name, discord_role_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (guild_id, role_type) DO UPDATE SET discord_role_id = $4`,
        [guildId, tier, nameMap[tier], newId]
      );
    } catch (_) {}
    return newId;
  }

  return null;
}

// Log a mod action to discord_mod_actions for audit trail.
async function logModAction(moderatorId, targetUserId, action, reason) {
  await pool.query(
    `INSERT INTO discord_mod_actions (guild_id, moderator_id, target_user_id, action, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [GUILD_ID, moderatorId, targetUserId, action, reason]
  );
}

// ── removeDiscordRoles(userId) — strip managed roles on unlink ────────────────
async function removeDiscordRoles(userId) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return { removed: false, reason: 'missing_bot_token' };

  const link = await getDiscordLinkByUserId(userId);
  if (!link) return { removed: false, reason: 'not_linked' };

  const discordId = link.discord_id;

  // Get current roles
  const getRes = await discordRequest('GET', `/guilds/${GUILD_ID}/members/${discordId}`, botToken, null);
  if (getRes.status !== 200 || !Array.isArray(getRes.body?.roles)) {
    return { removed: false, reason: 'get_member_failed' };
  }

  const currentRoles = getRes.body.roles;
  const knownRoleIds = [...new Set([...Object.values(STAFF_ROLE_MAP), ...Object.values(TIER_ROLE_MAP)])];
  const updatedRoles = currentRoles.filter(r => !knownRoleIds.includes(r));

  const patchRes = await discordRequest(
    'PATCH',
    `/guilds/${GUILD_ID}/members/${discordId}`,
    botToken,
    { roles: updatedRoles }
  );

  const success = patchRes.status >= 200 && patchRes.status < 300;
  console.log(JSON.stringify({ event: 'remove_discord_roles', user_id: userId, discord_id: discordId, success }));
  return success ? { removed: true } : { removed: false, reason: 'patch_failed', status: patchRes.status };
}

// ── syncAllGuildsForUser (legacy) — sync across all connected servers ─────────
async function syncAllGuildsForUser(userId) {
  const { pool } = require('../db/index');
  const result = await pool.query(
    'SELECT guild_id FROM discord_servers WHERE connected_at IS NOT NULL'
  );
  const guilds = result.rows.map(r => r.guild_id);
  const results = [];

  for (const guildId of guilds) {
    const r = await _syncGuild(guildId, userId);
    results.push({ guild_id: guildId, ...r });
  }
  return results;
}

// Internal single-guild sync (used by syncAllGuildsForUser)
async function _syncGuild(guildId, userId) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return { synced: false, reason: 'missing_bot_token' };

  const link = await getDiscordLinkByUserId(userId);
  if (!link) return { synced: false, reason: 'not_linked' };

  let tier = 'free';
  try {
    const email = await getUserEmailById(userId);
    if (email) {
      const m = await getUserMembership(email);
      if (m?.plan_slug) tier = m.plan_slug.toLowerCase();
    }
  } catch (_) {}

  const roleId = TIER_ROLE_MAP[tier] || TIER_ROLE_MAP.free;
  const discordId = link.discord_id;

  // Join guild
  await discordRequest('PUT', `/guilds/${guildId}/members/${discordId}`, botToken, {
    access_token: link.access_token, roles: [roleId],
  }).catch(() => {});

  // Get current
  const getRes = await discordRequest('GET', `/guilds/${guildId}/members/${discordId}`, botToken, null);
  if (getRes.status !== 200) return { synced: false, reason: 'get_failed' };

  const currentRoles = getRes.body?.roles || [];
  const knownTiers = Object.values(TIER_ROLE_MAP);
  const updatedRoles = [...new Set([...currentRoles.filter(r => !knownTiers.includes(r)), roleId])];

  const patchRes = await discordRequest('PATCH', `/guilds/${guildId}/members/${discordId}`, botToken, { roles: updatedRoles });
  return patchRes.status >= 200 && patchRes.status < 300
    ? { synced: true, tier, role_id: roleId }
    : { synced: false, reason: 'patch_failed' };
}

// Sync roles from DB (load role IDs into module cache — kept for compatibility)
async function syncRolesFromDb(pool) {
  try {
    const result = await pool.query(
      'SELECT slug, role_id FROM discord_roles WHERE role_id IS NOT NULL AND role_id != \u0027\u0027'
    );
    console.log(JSON.stringify({ event: 'discord_roles_loaded_from_db', roles: result.rows }));
  } catch (err) {
    console.log(JSON.stringify({ event: 'discord_roles_db_load_error', error: err.message }));
  }
}

// Legacy export — syncDiscordRole wraps syncRoles
async function syncDiscordRole(userId) {
  return syncRoles(userId);
}

module.exports = {
  syncRoles,
  syncDiscordRole,
  removeDiscordRoles,
  syncRolesFromDb,
  syncAllGuildsForUser,
};