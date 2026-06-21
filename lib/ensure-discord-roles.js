// lib/ensure-discord-roles.js — Bot setup on startup.
// Owns: creating tier roles, @everyone lockdown, #verify channel, bot-managed role cache.
// Does NOT own: role assignment to users (lib/discord-sync.js), OAuth flow, token storage.
//
// Env vars required: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID
// DB table required: discord_roles (migrated), discord_managed_roles (migration 20260602000000)

const https = require('https');

const DISCORD_API = 'https://discord.com/api/v10';

// ── Color constants (hex → decimal) ───────────────────────────────────────────
const COLOR_MEMBER   = 7506394;   // #7289da gray-blue
const COLOR_CREATOR  = 16119285;  // #f97316 orange
const COLOR_PRO      = 16767040;  // #ff9f1c amber
const COLOR_ELITE    = 10870393;  // #a855f7 purple
const COLOR_UNLIMITED= 15206668;  // #eab308 gold

// ── Core tier roles (always exist, hardcoded IDs) ────────────────────────────
const CORE_ROLES = [
  { slug: 'member',  name: '@member',        color: COLOR_MEMBER,   hoist: true, mentionable: true },
  { slug: 'creator', name: '@WAGE Creator',  color: COLOR_CREATOR,  hoist: true, mentionable: true },
  { slug: 'pro',     name: '@WAGE Pro',      color: COLOR_PRO,     hoist: true, mentionable: true },
];

// ── Bot-managed roles (created on startup if missing) ─────────────────────────
const BOT_MANAGED_ROLES = [
  { slug: 'elite',     name: 'Elite',     color: COLOR_ELITE,    hoist: true, mentionable: true },
  { slug: 'unlimited', name: 'Unlimited', color: COLOR_UNLIMITED, hoist: true, mentionable: true },
];

// ── Low-level HTTPS helper ────────────────────────────────────────────────────
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

// Persist role IDs to discord_roles table.
async function persistCoreRoleIds(pool, roles) {
  for (const role of roles) {
    await pool.query(
      `INSERT INTO discord_roles (slug, name, role_id, color_int)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE SET role_id = $3, name = $2, color_int = $4`,
      [role.slug, role.name, role.discordId, role.color]
    );
  }
}

// Persist bot-managed role IDs to discord_managed_roles.
async function persistBotManagedRoles(pool, guildId, roles) {
  for (const role of roles) {
    await pool.query(
      `INSERT INTO discord_managed_roles (guild_id, role_type, role_name, discord_role_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (guild_id, role_type) DO UPDATE SET discord_role_id = $4, role_name = $3`,
      [guildId, role.slug, role.name, role.discordId]
    );
  }
}

// Fetch all roles in a guild, returns { id → name } map.
async function fetchGuildRoles(botToken, guildId) {
  const res = await discordRequest('GET', `/guilds/${guildId}/roles`, botToken);
  if (res.status !== 200) return {};
  const byName = {};
  const byId = {};
  for (const r of (res.body || [])) {
    byName[r.name] = r.id;
    byId[r.id] = r.name;
  }
  return { byName, byId };
}

// ── Lock down @everyone — deny all channel permissions ───────────────────────
// Strips @everyone permissions so unverified users see NOTHING by default.
// Called on bot startup; idempotent.
// Note: @everyone role ID IS the guild snowflake in Discord's API.
async function lockdownEveryone(botToken, guildId) {
  const everyoneRoleId = guildId; // Discord uses guild ID as @everyone role ID
  const res = await discordRequest('PATCH', `/guilds/${guildId}/roles/${everyoneRoleId}`, botToken, {
    permissions: '0',
  });

  if (res.status === 200) {
    console.log(JSON.stringify({ event: 'lockdown_everyone_set', guild_id: guildId }));
  } else {
    console.log(JSON.stringify({ event: 'lockdown_everyone_failed', guild_id: guildId, status: res.status, body: res.body }));
  }
  return res;
}

// ── Create or find #verify channel ────────────────────────────────────────────
// Sets up permissions: @everyone CAN see + read #verify, nothing else.
// Posts an embed with a link to /settings for OAuth connect.
// Layer 1 guard: checks if a bot-sent verify embed already exists before posting.
async function setupVerifyChannel(botToken, guildId, pool) {
  const CHANNEL_NAME = 'verify';
  const VERIFY_EMBED_COLOR = 16119285; // orange #f97316
  const VERIFY_MESSAGE_MARKER = 'Verify Your Account'; // used for duplicate detection

  // Step 1: Create or find the channel
  let channelId = null;

  // Fetch existing channels to find #verify
  const channelsRes = await discordRequest('GET', `/guilds/${guildId}/channels`, botToken);
  if (channelsRes.status === 200 && Array.isArray(channelsRes.body)) {
    const existing = channelsRes.body.find(c => c.name === CHANNEL_NAME && c.type === 0);
    if (existing) channelId = existing.id;
  }

  // Create if missing
  if (!channelId) {
    const createRes = await discordRequest('POST', `/guilds/${guildId}/channels`, botToken, {
      name: CHANNEL_NAME,
      type: 0, // text channel
      topic: 'Connect your WAGE Society account to unlock the server.',
    });
    if (createRes.status === 201 && createRes.body?.id) {
      channelId = createRes.body.id;
      console.log(JSON.stringify({ event: 'verify_channel_created', channel_id: channelId }));
    } else {
      console.log(JSON.stringify({ event: 'verify_channel_create_failed', status: createRes.status, body: createRes.body }));
      return null;
    }
  }

  // Step 2: Fetch the @everyone role ID and Member role ID
  const memberRoleId = await _resolveRoleIdByName(botToken, guildId, '@member');
  const everyoneRoleId = await _resolveEveryoneRoleId(botToken, guildId);

  if (!everyoneRoleId) {
    console.log(JSON.stringify({ event: 'verify_setup_cannot_resolve_everyone', guild_id: guildId }));
    return channelId;
  }

  // Step 3: Set channel permissions
  // @everyone: allow VIEW_CHANNEL + READ_MESSAGE_HISTORY on #verify only
  // @Member: deny VIEW_CHANNEL (once they have Member role, hide #verify from them)
  await discordRequest('PUT', `/channels/${channelId}/permissions/${everyoneRoleId}`, botToken, {
    allow: '1024', // VIEW_CHANNEL
    type: 0, // role
  }).catch(err => console.log(JSON.stringify({ event: 'verify_everyone_perms_failed', error: err.message })));

  if (memberRoleId && everyoneRoleId) {
    // Make #verify hidden from Members (they've verified, don't show it again)
    // But we keep it visible to those without the Member role
    // This effectively means: only those WITHOUT the Member role can see #verify
    // We'll set it so: @everyone can see, but Member role overrides to DENY
    await discordRequest('PUT', `/channels/${channelId}/permissions/${memberRoleId}`, botToken, {
      deny: '1024', // VIEW_CHANNEL — hide from Members
      type: 0,
    }).catch(err => console.log(JSON.stringify({ event: 'verify_member_perms_failed', error: err.message })));
  }

  // Step 4: Post the verification embed (pinned)
  // Layer 1 guard: check if a bot-sent verify message already exists in this channel
  let alreadySent = false;
  try {
    const botUserId = await getBotClientUserId(botToken);
    const msgsRes = await discordRequest('GET', `/channels/${channelId}/messages?limit=10`, botToken);
    if (msgsRes.status === 200 && Array.isArray(msgsRes.body)) {
      alreadySent = msgsRes.body.some(m =>
        m.author.id === botUserId &&
        m.content?.toLowerCase().includes(VERIFY_MESSAGE_MARKER.toLowerCase())
      );
      if (alreadySent) {
        console.log(JSON.stringify({ event: 'verify_message_skip', reason: 'already_exists', channel_id: channelId }));
      }
    }
  } catch (err) {
    console.log(JSON.stringify({ event: 'verify_message_check_error', error: err.message }));
  }

  if (alreadySent) {
    return channelId;
  }

  const embedPayload = {
    content: null,
    embeds: [{
      title: '🔐 Verify Your Account',
      description: 'Connect your WAGE Society account to unlock the server.',
      color: VERIFY_EMBED_COLOR,
      url: 'https://wagesociety.com/settings',
      fields: [],
      footer: { text: 'Once verified, you get the Member role and full server access.' },
    }],
    components: [{
      type: 1,
      components: [{
        type: 2,
        style: 5, // link button
        label: 'Verify Now →',
        url: 'https://wagesociety.com/settings',
      }],
    }],
  };

  const msgRes = await discordRequest('POST', `/channels/${channelId}/messages`, botToken, embedPayload);
  if ((msgRes.status === 200 || msgRes.status === 201) && msgRes.body?.id) {
    // Pin the message
    await discordRequest('PUT', `/channels/${channelId}/messages/${msgRes.body.id}/crosspost`, botToken, null).catch(() => {});
    console.log(JSON.stringify({ event: 'verify_embed_posted', channel_id: channelId, message_id: msgRes.body.id }));
  } else {
    console.log(JSON.stringify({ event: 'verify_embed_post_failed', status: msgRes.status, body: msgRes.body }));
  }

  return channelId;
}

// Resolve a role ID by its name.
async function _resolveRoleIdByName(botToken, guildId, name) {
  const { byName } = await fetchGuildRoles(botToken, guildId);
  return byName[name] || null;
}

// Resolve the @everyone role ID (it's always the guild's ID in Discord).
async function _resolveEveryoneRoleId(botToken, guildId) {
  return guildId; // Discord uses the guild ID as the @everyone role ID
}

// ── Bot state helpers ────────────────────────────────────────────────────────
let _botUserIdCache = null;
async function getBotClientUserId(botToken) {
  if (_botUserIdCache) return _botUserIdCache;
  const res = await discordRequest('GET', '/users/@me', botToken);
  if (res.status === 200 && res.body?.id) {
    _botUserIdCache = res.body.id;
  }
  return _botUserIdCache || null;
}

async function getBotState(pool, key) {
  const { rows } = await pool.query(
    'SELECT value FROM discord_bot_state WHERE key = $1',
    [key]
  );
  return rows[0]?.value || null;
}

async function setBotState(pool, key, value) {
  await pool.query(
    `INSERT INTO discord_bot_state (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value]
  );
}

// ── ensureRoles(botToken, guildId, pool) — main export ───────────────────────
// Runs on bot startup. Creates missing roles, locks down @everyone, sets up #verify.
// Idempotent: skips full setup if server_setup_complete flag is already 'true'.
async function ensureRoles(botToken, guildId, pool) {
  if (!botToken || !guildId) {
    console.log(JSON.stringify({ event: 'discord_roles_skip', reason: 'missing_env' }));
    return { created: {}, existing: {}, managed: {} };
  }

  // Layer 2 guard: skip auto-setup if already done
  const alreadyDone = await getBotState(pool, 'server_setup_complete');
  if (alreadyDone === 'true') {
    console.log(JSON.stringify({ event: 'server_setup_skip', reason: 'already_complete' }));
    return { skipped: true };
  }

  // 1. Lock down @everyone (deny all perms so unverified users see nothing)
  await lockdownEveryone(botToken, guildId);

  // 2. Fetch existing roles
  const { byName } = await fetchGuildRoles(botToken, guildId);

  // 3. Create core tier roles (@member, @WAGE Creator, @WAGE Pro)
  const coreCreated = {};
  const coreExisting = {};
  for (const role of CORE_ROLES) {
    if (byName[role.name]) {
      coreExisting[role.slug] = byName[role.name];
    } else {
      const createRes = await discordRequest('POST', `/guilds/${guildId}/roles`, botToken, {
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        mentionable: role.mentionable,
        permissions: '1024', // VIEW_CHANNELS (read-only base)
      });
      if (createRes.status === 200 && createRes.body?.id) {
        coreCreated[role.slug] = createRes.body.id;
        console.log(JSON.stringify({ event: 'core_role_created', slug: role.slug, id: createRes.body.id }));
      } else {
        console.log(JSON.stringify({ event: 'core_role_create_failed', slug: role.slug, status: createRes.status }));
      }
    }
  }

  // Persist core role IDs to DB
  const coreAll = { ...coreExisting, ...coreCreated };
  if (Object.keys(coreAll).length > 0) {
    await persistCoreRoleIds(pool, Object.entries(coreAll).map(([slug, discordId]) => {
      const meta = CORE_ROLES.find(r => r.slug === slug);
      return { slug, name: meta?.name || slug, color: meta?.color || 0, discordId };
    })).catch(err => console.log(JSON.stringify({ event: 'core_roles_persist_error', error: err.message })));
  }

  // 4. Create bot-managed roles (Elite, Unlimited)
  const managedCreated = {};
  const managedExisting = {};
  for (const role of BOT_MANAGED_ROLES) {
    if (byName[role.name]) {
      managedExisting[role.slug] = byName[role.name];
    } else {
      const createRes = await discordRequest('POST', `/guilds/${guildId}/roles`, botToken, {
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        mentionable: role.mentionable,
        permissions: '0',
      });
      if (createRes.status === 200 && createRes.body?.id) {
        managedCreated[role.slug] = createRes.body.id;
        console.log(JSON.stringify({ event: 'managed_role_created', slug: role.slug, id: createRes.body.id }));
      } else {
        console.log(JSON.stringify({ event: 'managed_role_create_failed', slug: role.slug, status: createRes.status }));
      }
    }
  }

  // Persist managed role IDs to discord_managed_roles
  const managedAll = { ...managedExisting, ...managedCreated };
  if (Object.keys(managedAll).length > 0) {
    await persistBotManagedRoles(pool, guildId, Object.entries(managedAll).map(([slug, discordId]) => {
      const meta = BOT_MANAGED_ROLES.find(r => r.slug === slug);
      return { slug, name: meta?.name || slug, color: meta?.color || 0, discordId };
    })).catch(err => console.log(JSON.stringify({ event: 'managed_roles_persist_error', error: err.message })));
  }

  // 5. Set up #verify channel
  const verifyChannelId = await setupVerifyChannel(botToken, guildId, pool);
  if (verifyChannelId) {
    console.log(JSON.stringify({ event: 'verify_channel_ready', channel_id: verifyChannelId }));
  }

  // Mark setup complete so future startups skip auto-setup
  await setBotState(pool, 'server_setup_complete', 'true');
  console.log(JSON.stringify({ event: 'server_setup_complete', guild_id: guildId }));

  // 6. Set per-channel overrides so ONLY #verify is visible to @everyone
  // For channels OTHER than #verify, explicitly deny VIEW_CHANNEL to @everyone
  // This is the second layer of lockdown on top of @everyone.setPermissions(0)
  await setChannelVisibilityDefaults(botToken, guildId, verifyChannelId);

  return {
    created: coreCreated,
    existing: coreExisting,
    managed: { created: managedCreated, existing: managedExisting },
    verify_channel_id: verifyChannelId,
  };
}

// For each text channel in the guild, set @everyone to deny VIEW_CHANNEL
// except for the verify channel. This runs after @everyone.setPermissions(0)
// to ensure that even if per-channel permissions are more permissive,
// the explicit deny wins.
async function setChannelVisibilityDefaults(botToken, guildId, verifyChannelId) {
  const channelsRes = await discordRequest('GET', `/guilds/${guildId}/channels`, botToken);
  if (channelsRes.status !== 200 || !Array.isArray(channelsRes.body)) return;

  // Resolve @everyone role ID (= guild ID)
  const everyoneRoleId = guildId;

  for (const channel of channelsRes.body) {
    // Skip categories and voice channels
    if (channel.type !== 0) continue;
    if (channel.id === verifyChannelId) continue;

    // Explicitly deny VIEW_CHANNEL for @everyone on all other channels
    // This is redundant if @everyone.setPermissions([]) was already applied,
    // but provides a safety net for channels that were created with different defaults.
    await discordRequest('PUT', `/channels/${channel.id}/permissions/${everyoneRoleId}`, botToken, {
      deny: '1024', // VIEW_CHANNEL
      type: 0,
    }).catch(err => console.log(JSON.stringify({ event: 'channel_lockdown_failed', channel_id: channel.id, error: err.message })));
  }

  console.log(JSON.stringify({ event: 'channel_visibility_defaults_set', guild_id: guildId, verify_channel_id: verifyChannelId }));
}

module.exports = { ensureRoles };