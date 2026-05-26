// lib/ensure-discord-roles.js — Bot creates and owns its three tier roles in the Discord server.
// Owns: creating @member, @WAGE Creator, @WAGE Pro on startup if missing; persisting their IDs.
// Does NOT own: role assignment to users (lib/discord-sync.js), OAuth flow, token storage.
//
// Env vars required: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID
// DB table required: discord_roles (created by migration 1779621760)

const https = require('https');

// Discord color hex → decimal
const COLOR_MEMBER  = 7506394;   // #7289da gray-blue
const COLOR_CREATOR = 16119285;  // #f97316 orange
const COLOR_PRO     = 16767040;  // #ff9f1c amber

const ROLES = [
  { slug: 'member',  name: '@member',       color: COLOR_MEMBER,  hoist: true,  mentionable: true },
  { slug: 'creator', name: '@WAGE Creator', color: COLOR_CREATOR, hoist: true,  mentionable: true },
  { slug: 'pro',     name: '@WAGE Pro',     color: COLOR_PRO,     hoist: true,  mentionable: true },
];

const DISCORD_API = 'https://discord.com/api/v10';

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
        try { resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', (err) => resolve({ status: 0, body: null, error: err.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

// Write role IDs to the discord_roles DB table so syncDiscordRole can read them
async function persistRoleIds(pool, roles) {
  for (const role of roles) {
    await pool.query(
      `INSERT INTO discord_roles (slug, name, role_id, color_int)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE SET role_id = $3, name = $2, color_int = $4`,
      [role.slug, role.name, role.discordId, role.color]
    );
  }
}

// Returns { created, existing } where each has slug → discordId
async function ensureRoles(botToken, guildId, pool) {
  if (!botToken || !guildId) {
    console.log(JSON.stringify({ event: 'discord_roles_skip', reason: 'missing_env' }));
    return { created: {}, existing: {} };
  }

  // 1. Fetch all existing roles in the guild
  const getRes = await discordRequest('GET', `/guilds/${guildId}/roles`, botToken);
  if (getRes.status !== 200) {
    console.log(JSON.stringify({ event: 'discord_roles_fetch_failed', status: getRes.status }));
    return { created: {}, existing: {} };
  }

  const existingRoles = getRes.body || [];
  const byName = {};
  for (const r of existingRoles) byName[r.name] = r.id;

  // 2. Create roles in hierarchy order — @member first (lowest), then Creator, then Pro (highest)
  const created = {};
  const already = {};

  for (const role of ROLES) {
    if (byName[role.name]) {
      already[role.slug] = byName[role.name];
      console.log(JSON.stringify({ event: 'discord_role_found', slug: role.slug, name: role.name, id: byName[role.name] }));
    } else {
      const createRes = await discordRequest(
        'POST',
        `/guilds/${guildId}/roles`,
        botToken,
        {
          name: role.name,
          color: role.color,
          hoist: role.hoist,
          mentionable: role.mentionable,
          // Permissions: Read Messages (1<<10) + View Channels (1<<10 still...) let's give read perms
          // Use 1024 = View Channels permission only
          permissions: '1024',
        }
      );

      if (createRes.status === 200 && createRes.body?.id) {
        created[role.slug] = createRes.body.id;
        console.log(JSON.stringify({ event: 'discord_role_created', slug: role.slug, name: role.name, id: createRes.body.id }));
      } else {
        console.log(JSON.stringify({ event: 'discord_role_create_failed', slug: role.slug, name: role.name, status: createRes.status, body: createRes.body }));
      }
    }
  }

  // 3. Persist all known IDs to DB
  const allIds = { ...already, ...created };
  if (Object.keys(allIds).length > 0) {
    await persistRoleIds(pool, Object.entries(allIds).map(([slug, discordId]) => {
      const meta = ROLES.find(r => r.slug === slug);
      return { slug, name: meta?.name || slug, color: meta?.color || 7506394, discordId };
    })).catch(err => {
      console.log(JSON.stringify({ event: 'discord_roles_persist_error', error: err.message }));
    });
  }

  return { created, existing: already };
}

module.exports = { ensureRoles, ROLES };