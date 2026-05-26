// lib/discord-sync.js — Discord role sync helper.
// Owns: syncing a user's membership tier → Discord guild role via the bot token.
// Does NOT own: OAuth flow, token storage, session management, route handling.
//
// Required env vars: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID
// Role IDs: prefer discord_roles table (populated by lib/ensure-discord-roles.js on startup),
//           fall back to env vars DISCORD_ROLE_FREE_ID / _CREATOR_ID / _PRO_ID.

const https = require('https');
const { getDiscordLinkByUserId, getUserEmailById, updateDiscordLink } = require('../db/discord');
const { getUserMembership } = require('../db/memberships');

const DISCORD_API = 'https://discord.com/api/v10';

// Runtime cache — updated by syncRolesFromDb() and ensureRolesOnStartup().
let _cachedRoleIds = {
  member:  null,
  creator: null,
  pro:     null,
};

// Load role IDs from the discord_roles table.
// Safe to call multiple times; subsequent calls refresh from DB.
async function syncRolesFromDb(pool) {
  try {
    const result = await pool.query(
      'SELECT slug, role_id FROM discord_roles WHERE role_id != \u0027\u0027 AND role_id IS NOT NULL'
    );
    for (const row of result.rows) {
      if (_cachedRoleIds.hasOwnProperty(row.slug)) {
        _cachedRoleIds[row.slug] = row.role_id;
      }
    }
    console.log(JSON.stringify({ event: 'discord_roles_loaded_from_db', roles: { ..._cachedRoleIds } }));
  } catch (err) {
    console.log(JSON.stringify({ event: 'discord_roles_db_load_error', error: err.message }));
  }
}

// Returns the role ID for a given tier slug — DB cache first, env var fallback.
function resolveRoleId(slug) {
  return _cachedRoleIds[slug] || null;
}

// All managed role IDs (DB cache + env fallback) — used to filter out old tier roles.
function getManagedRoleIds() {
  const cached = Object.values(_cachedRoleIds).filter(Boolean);
  const env = [
    process.env.DISCORD_ROLE_FREE_ID,
    process.env.DISCORD_ROLE_CREATOR_ID,
    process.env.DISCORD_ROLE_PRO_ID,
  ].filter(Boolean);
  return [...new Set([...cached, ...env])];
}

function tierToRoleId(tier) {
  return _cachedRoleIds[tier] || (
    tier === 'creator' ? process.env.DISCORD_ROLE_CREATOR_ID :
    tier === 'pro'     ? process.env.DISCORD_ROLE_PRO_ID :
    process.env.DISCORD_ROLE_FREE_ID
  ) || null;
}

module.exports = { syncDiscordRole, removeDiscordRoles, syncRolesFromDb };

// Low-level Discord REST helper using only Node's built-in https.
// Returns { status, body } — never throws on API errors.
function discordRequest(method, path, botToken, body) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const { hostname, pathname } = new URL(DISCORD_API + path);
    const options = {
      hostname,
      path: pathname,
      method,
      headers: {
        Authorization: `Bot ${botToken}`,
        'User-Agent': 'WageOSBot/1.0',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', (err) => resolve({ status: 0, body: null, error: err.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

// Refresh a user's access token if it has expired.
// Returns updated { access_token, refresh_token, token_expires_at } or null on failure.
async function refreshTokenIfNeeded(link) {
  if (!link.token_expires_at) return null;
  const expires = new Date(link.token_expires_at);
  if (expires > new Date()) return null; // still valid

  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: link.refresh_token,
  }).toString();

  return new Promise((resolve) => {
    const reqBody = body;
    const options = {
      hostname: 'discord.com',
      path: '/api/oauth2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(reqBody),
      },
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
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.write(reqBody);
    req.end();
  });
}

// syncDiscordRole(userId) — primary export.
// Reads the user's current membership tier, maps it to a Discord role ID,
// joins the guild via the user's access_token, then PATCHes roles.
// Never throws — always returns a structured result object.
async function syncDiscordRole(userId) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId  = process.env.DISCORD_GUILD_ID;

  if (!botToken || !guildId) {
    const reason = 'missing_env';
    console.log(JSON.stringify({ event: 'discord_sync_skip', user_id: userId, reason }));
    return { synced: false, reason };
  }

  let link;
  try {
    link = await getDiscordLinkByUserId(userId);
  } catch (err) {
    console.log(JSON.stringify({ event: 'discord_sync_error', user_id: userId, reason: 'db_error', error: err.message }));
    return { synced: false, reason: 'db_error', error: err.message };
  }

  if (!link) {
    console.log(JSON.stringify({ event: 'discord_sync_skip', user_id: userId, reason: 'not_linked' }));
    return { synced: false, reason: 'not_linked' };
  }

  // Refresh access token if needed and persist updated tokens
  const refreshed = await refreshTokenIfNeeded(link);
  if (refreshed) {
    try {
      await updateDiscordLink(userId, {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        token_expires_at: refreshed.token_expires_at,
      });
      link.access_token = refreshed.access_token;
      console.log(JSON.stringify({ event: 'discord_token_refreshed', user_id: userId }));
    } catch (err) {
      // Non-fatal — proceed with old token
      console.log(JSON.stringify({ event: 'discord_token_refresh_persist_error', user_id: userId, error: err.message }));
    }
  }

  // Determine target tier
  let tier = 'free';
  try {
    const email = await getUserEmailById(userId);
    if (email) {
      const membership = await getUserMembership(email);
      if (membership?.plan_slug) tier = membership.plan_slug;
    }
  } catch (err) {
    // Default to free tier on error — still sync, don't block
    console.log(JSON.stringify({ event: 'discord_sync_tier_lookup_error', user_id: userId, error: err.message }));
  }

  const targetRoleId = tierToRoleId(tier);
  if (!targetRoleId) {
    const reason = `missing_role_env_for_${tier}`;
    console.log(JSON.stringify({ event: 'discord_sync_skip', user_id: userId, reason }));
    return { synced: false, reason };
  }

  const discordId = link.discord_id;

  // Step 1: PUT guild member — joins guild if absent AND sets the target role.
  // Only works if guilds.join scope was granted and bot has Manage Roles.
  const putRes = await discordRequest(
    'PUT',
    `/guilds/${guildId}/members/${discordId}`,
    botToken,
    { access_token: link.access_token, roles: [targetRoleId] }
  );

  // 201 = joined + roles set; 204 = already a member (roles via PUT may be ignored for existing members)
  const joined = putRes.status === 201 || putRes.status === 204 || putRes.status === 200;
  if (!joined && putRes.status !== 204) {
    console.log(JSON.stringify({ event: 'discord_put_member_result', user_id: userId, status: putRes.status, body: putRes.body }));
  }

  // Step 2: PATCH existing member to set the exact right role set for managed roles.
  // Get current roles, remove other managed tiers, ensure target is present.
  const getMemberRes = await discordRequest('GET', `/guilds/${guildId}/members/${discordId}`, botToken, null);

  let patchResult;
  if (getMemberRes.status === 200 && Array.isArray(getMemberRes.body?.roles)) {
    const currentRoles = getMemberRes.body.roles;
    const managed = getManagedRoleIds();
    // Keep all non-managed roles + add target, remove other managed tiers
    const updatedRoles = [
      ...currentRoles.filter(r => !managed.includes(r)),
      targetRoleId,
    ];

    patchResult = await discordRequest(
      'PATCH',
      `/guilds/${guildId}/members/${discordId}`,
      botToken,
      { roles: updatedRoles }
    );
    console.log(JSON.stringify({ event: 'discord_patch_member', user_id: userId, discord_id: discordId, tier, role_id: targetRoleId, status: patchResult.status }));
  } else {
    // Member fetch failed — log but don't fail the sync (PUT may have set roles)
    console.log(JSON.stringify({ event: 'discord_get_member_failed', user_id: userId, status: getMemberRes.status }));
    patchResult = { status: putRes.status };
  }

  // Step 3: Update last_synced_at
  try {
    await updateDiscordLink(userId, { last_synced_at: new Date() });
  } catch (err) {
    console.log(JSON.stringify({ event: 'discord_sync_timestamp_error', user_id: userId, error: err.message }));
  }

  const success = patchResult.status >= 200 && patchResult.status < 300;
  const result = success
    ? { synced: true, tier, role_id: targetRoleId, discord_id: discordId }
    : { synced: false, reason: 'discord_api_error', status: patchResult.status, discord_id: discordId };

  console.log(JSON.stringify({ event: 'discord_sync_complete', user_id: userId, ...result }));
  return result;
}

// removeDiscordRoles(userId) — strips all managed tier roles from the user
// but does NOT kick them from the guild.
async function removeDiscordRoles(userId) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId  = process.env.DISCORD_GUILD_ID;

  if (!botToken || !guildId) {
    console.log(JSON.stringify({ event: 'discord_remove_roles_skip', user_id: userId, reason: 'missing_env' }));
    return { removed: false, reason: 'missing_env' };
  }

  let link;
  try {
    link = await getDiscordLinkByUserId(userId);
  } catch (err) {
    return { removed: false, reason: 'db_error', error: err.message };
  }

  if (!link) {
    return { removed: false, reason: 'not_linked' };
  }

  const discordId = link.discord_id;
  const managed = getManagedRoleIds();

  // Fetch current roles
  const getMemberRes = await discordRequest('GET', `/guilds/${guildId}/members/${discordId}`, botToken, null);
  if (getMemberRes.status !== 200 || !Array.isArray(getMemberRes.body?.roles)) {
    console.log(JSON.stringify({ event: 'discord_remove_roles_get_failed', user_id: userId, status: getMemberRes.status }));
    return { removed: false, reason: 'could_not_fetch_member' };
  }

  const updatedRoles = getMemberRes.body.roles.filter(r => !managed.includes(r));

  const patchRes = await discordRequest(
    'PATCH',
    `/guilds/${guildId}/members/${discordId}`,
    botToken,
    { roles: updatedRoles }
  );

  const success = patchRes.status >= 200 && patchRes.status < 300;
  console.log(JSON.stringify({ event: 'discord_remove_roles_complete', user_id: userId, discord_id: discordId, success, status: patchRes.status }));
  return success ? { removed: true, discord_id: discordId } : { removed: false, reason: 'patch_failed', status: patchRes.status };
}

module.exports = { syncDiscordRole, removeDiscordRoles, syncRolesFromDb };
