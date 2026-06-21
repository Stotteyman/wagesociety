// routes/api/discord-servers.js — Discord server install + management.
const express = require('express');
const router = express.Router();
const https = require('https');
const {
  upsertServer,
  getServerByGuildId,
  listServersByUser,
  markServerConnected,
  claimServer,
  createDefaultConfig,
  updateServerConfig,
  getServerOwnership,
  getConnectedServers,
} = require('../../db/discord-servers');
const { getDiscordLinkByUserId, getUserIdByEmail, updateDiscordLink } = require('../../db/discord');
const { refreshDiscordToken } = require('../../lib/discord-token');

const DISCORD_API = 'https://discord.com/api/v10';
const INSTALL_BASE = 'https://discord.com/api/oauth2/authorize';
const APP_URL = process.env.APP_URL || 'https://wagesociety.com';

// ── Low-level Discord REST via built-in https ─────────────────────────────────
function discordBotRequest(method, path, body) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return Promise.resolve({ status: 0, body: null, error: 'no_bot_token' });

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
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', (err) => resolve({ status: 0, body: null, error: err.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

// ── DM a Discord user (bot token required) ────────────────────────────────────
async function dmUser(discordId, messageContent) {
  // First, get/create a DM channel
  const channelRes = await discordBotRequest('POST', '/users/@me/channels', { recipient_id: discordId });
  if (channelRes.status !== 200 || !channelRes.body?.id) {
    console.log(JSON.stringify({ event: 'dm_channel_create_failed', discord_id: discordId, status: channelRes.status }));
    return false;
  }
  const channelId = channelRes.body.id;
  const msgRes = await discordBotRequest('POST', `/channels/${channelId}/messages`, { content: messageContent });
  if (msgRes.status !== 200) {
    console.log(JSON.stringify({ event: 'dm_send_failed', discord_id: discordId, status: msgRes.status, body: msgRes.body }));
    return false;
  }
  console.log(JSON.stringify({ event: 'dm_sent', discord_id: discordId }));
  return true;
}

// ── Discord REST using a user's OAuth access token ─────────────────────────
function discordUserRequest(method, path, accessToken) {
  return new Promise((resolve) => {
    const { hostname, pathname } = new URL(DISCORD_API + path);
    const options = {
      hostname, path: pathname, method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'WageOSBot/1.0',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', (err) => resolve({ status: 0, body: null, error: err.message }));
    req.end();
  });
}

// ── Auth guard (used by all endpoints) ────────────────────────────────────────
function requireAuth(req, res) {
  if (!req.session?.userId && !req.session?.userEmail) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  return null; // no error — proceed
}

// ── GET /api/discord-servers/user-guilds ─────────────────────────────────────
// Fetches the user's Discord guilds via their stored access token,
// filters for ADMINISTRATOR permission (bit 0x8), cross-references with
// discord_servers to show bot install status.
router.get('/user-guilds', async (req, res) => {
  const authErr = requireAuth(req, res);
  if (authErr) return;

  try {
    // discord_links.user_id is an integer FK to `users` table, NOT the UUID from auth_users.
    // Resolve integer ID from session email.
    const email = req.session.userEmail;
    if (!email) return res.json({ connected: false, guilds: [] });
    const intUserId = await getUserIdByEmail(email);
    if (!intUserId) return res.json({ connected: false, guilds: [] });

    const link = await getDiscordLinkByUserId(intUserId);
    if (!link) {
      return res.json({ connected: false, guilds: [] });
    }

    // Refresh token if expired
    let accessToken = link.access_token;
    const refreshed = await refreshDiscordToken(link);
    if (refreshed) {
      accessToken = refreshed.access_token;
      await updateDiscordLink(link.user_id, {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        token_expires_at: refreshed.token_expires_at,
      });
    }

    // Fetch guilds from Discord
    const guildsRes = await discordUserRequest('GET', '/users/@me/guilds', accessToken);
    if (guildsRes.status === 401) {
      // Token refresh failed or refresh_token itself is revoked
      console.log(JSON.stringify({ event: 'user_guilds_token_dead', status: guildsRes.status }));
      return res.json({ connected: true, needsRelink: true, guilds: [] });
    }
    if (guildsRes.status !== 200) {
      console.log(JSON.stringify({ event: 'user_guilds_fetch_failed', status: guildsRes.status }));
      return res.json({ connected: true, needsRelink: true, guilds: [] });
    }

    const allGuilds = Array.isArray(guildsRes.body) ? guildsRes.body : [];

    // Filter for guilds where user has ADMINISTRATOR permission (bit 0x8)
    const ADMIN_BIT = 0x8;
    const adminGuilds = allGuilds.filter(g => (parseInt(g.permissions) & ADMIN_BIT) === ADMIN_BIT);

    // Get connected servers from DB to check bot install status
    const connectedServers = await getConnectedServers();
    const connectedMap = new Map(connectedServers.map(s => [s.guild_id, s]));

    const clientId = process.env.DISCORD_CLIENT_ID;
    const guilds = adminGuilds.map(g => {
      const dbServer = connectedMap.get(g.id);
      const iconUrl = g.icon
        ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128`
        : null;
      return {
        id: g.id,
        name: g.name,
        icon: iconUrl,
        memberCount: g.approximate_member_count || null,
        botInstalled: !!dbServer,
        wageRoleId: dbServer?.wage_role_id || null,
        inviteUrl: clientId
          ? `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=268435456&scope=bot+applications.commands&guild_id=${g.id}`
          : null,
      };
    });

    res.json({ connected: true, discordUsername: link.discord_username, guilds });
  } catch (err) {
    console.error('[discord-servers/user-guilds]', err);
    res.status(500).json({ error: 'Failed to fetch guilds' });
  }
});

// ── GET /api/discord-servers — list the current user's servers ────────────────
router.get('/', (req, res) => {
  const err = requireAuth(req, res);
  if (err) return;

  listServersByUser(req.session.userId)
    .then((servers) => res.json({ servers }))
    .catch((err) => {
      console.error('[discord-servers/list]', err);
      res.status(500).json({ error: 'Failed to load servers' });
    });
});

// ── POST /api/discord-servers/generate-install-url ────────────────────────────
// Body: { guildId, guildName }
router.post('/generate-install-url', (req, res) => {
  const err = requireAuth(req, res);
  if (err) return;

  const { guildId, guildName } = req.body;
  if (!guildId || typeof guildId !== 'string') {
    return res.status(400).json({ error: 'guildId is required' });
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'Discord client not configured' });
  }

  // Store a pending record for this guild so the bot-join webhook can tie it back
  upsertServer({ guildId, name: guildName || guildId, ownerDiscordId: null })
    .catch((err) => console.error('[discord-servers/upsert]', err));

  // Build OAuth2 bot authorization link with admin permissions
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: '8', // ADMINISTRATOR
    guild_id: guildId,
    scope: 'bot applications.commands',
  });

  const installUrl = `${INSTALL_BASE}?${params}`;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

  console.log(JSON.stringify({ event: 'install_url_generated', guild_id: guildId, user_id: req.session.userId }));

  res.json({
    installUrl,
    expiresAt,
    guildId,
    note: 'Add the bot to your server with ADMINISTRATOR permissions to enable full management.',
  });
});

// ── POST /api/discord-servers/webhook/bot-joined ─────────────────────────────
// Called by the external bot when it joins a new guild (guildCreate event).
// Security: verify DISCORD_WEBHOOK_SECRET if set.
router.post('/webhook/bot-joined', async (req, res) => {
  // Optional webhook secret check
  const secret = process.env.DISCORD_WEBHOOK_SECRET;
  if (secret && req.headers['x-webhook-secret'] !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { guild_id, name, icon, owner_id } = req.body;
  if (!guild_id) {
    return res.status(400).json({ error: 'guild_id is required' });
  }

  console.log(JSON.stringify({ event: 'bot_joined_guild', guild_id, name, owner_id }));

  try {
    // Upsert the server row with known data
    const server = await upsertServer({
      guildId: guild_id,
      name: name || null,
      iconUrl: icon ? `https://cdn.discordapp.com/icons/${guild_id}/${icon}.png` : null,
      ownerDiscordId: owner_id || null,
    });

    // Mark as connected
    await markServerConnected(guild_id, req.body.invite_code || null);

    // Create default config if not exists
    if (server) {
      await createDefaultConfig(server.id);
    }

    // If we know the owner's Discord ID, DM them
    if (owner_id && server) {
      const serverName = name || 'your server';
      await dmUser(owner_id, `✅ **${serverName}** is now connected to W.A.G.E. Society!\nManage your server: ${APP_URL}/dashboard/discord/servers`);
    }

    res.json({ ok: true, server_id: server?.id });
  } catch (err) {
    console.error('[discord-servers/webhook]', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ── POST /api/discord-servers/claim ──────────────────────────────────────────
// Claim an unclaimed server the user owns via Discord OAuth.
// Body: { guildId }
router.post('/claim', (req, res) => {
  const err = requireAuth(req, res);
  if (err) return;

  const { guildId } = req.body;
  if (!guildId) return res.status(400).json({ error: 'guildId is required' });

  // Verify the user is the bot-admin or the guild owner via Discord API
  // For now: check they can be verified via their Discord account link
  const userId = req.session.userId;

  claimServer(guildId, userId, null)
    .then((server) => {
      if (!server) return res.status(404).json({ error: 'Server not found' });
      console.log(JSON.stringify({ event: 'server_claimed', guild_id: guildId, user_id: userId }));
      res.json({ server });
    })
    .catch((err) => {
      console.error('[discord-servers/claim]', err);
      res.status(500).json({ error: 'Failed to claim server' });
    });
});

// ── GET /api/discord-servers/:guildId ─────────────────────────────────────────
router.get('/:guildId', (req, res) => {
  const err = requireAuth(req, res);
  if (err) return;

  const { guildId } = req.params;

  getServerOwnership(guildId, req.session.userId)
    .then((server) => {
      if (!server) return res.status(403).json({ error: 'Not your server' });
      res.json({ server });
    })
    .catch((err) => {
      console.error('[discord-servers/get]', err);
      res.status(500).json({ error: 'Failed to load server' });
    });
});

// ── PATCH /api/discord-servers/:guildId/config ────────────────────────────────
// Body: { auto_role_free, auto_role_creator, auto_role_pro, welcome_channel_id,
//         log_channel_id, greetings_enabled, mod_commands_enabled }
router.patch('/:guildId/config', (req, res) => {
  const err = requireAuth(req, res);
  if (err) return;

  const { guildId } = req.params;

  getServerOwnership(guildId, req.session.userId)
    .then(async (server) => {
      if (!server) return res.status(403).json({ error: 'Not your server' });

      const config = await updateServerConfig(server.id, req.body);
      if (!config) return res.status(400).json({ error: 'No valid config fields provided' });

      console.log(JSON.stringify({ event: 'server_config_updated', guild_id: guildId, user_id: req.session.userId }));
      res.json({ config });
    })
    .catch((err) => {
      console.error('[discord-servers/config]', err);
      res.status(500).json({ error: 'Failed to update config' });
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// Dashboard-only endpoints — /api/discord/* (authenticated, Discord linked)
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/discord/my-servers — list servers the current user owns
router.get('/my-servers', (req, res) => {
  const err = requireAuth(req, res);
  if (err) return;

  listServersByUser(req.session.userId)
    .then((servers) => res.json({ servers }))
    .catch((err) => {
      console.error('[discord/my-servers]', err);
      res.status(500).json({ error: 'Failed to load servers' });
    });
});

// GET /api/discord/servers/:guildId — full server info + stats from Discord API
router.get('/servers/:guildId', (req, res) => {
  const err = requireAuth(req, res);
  if (err) return;
  const { guildId } = req.params;

  Promise.all([
    getServerOwnership(guildId, req.session.userId),
    getServerByGuildId(guildId),
  ]).then(([ownership, server]) => {
    if (!ownership) return res.status(403).json({ error: 'Not your server' });
    return server;
  }).then(async (server) => {
    if (!server) return res.status(404).json({ error: 'Server not found' });

    // Fetch live stats from Discord API if bot token available
    const stats = { memberCount: null, onlineCount: null, channelCount: null, roleCount: null, verificationLevel: null };
    const botToken = process.env.DISCORD_BOT_TOKEN;

    if (botToken) {
      try {
        const [guildRes, rolesRes, channelsRes] = await Promise.all([
          discordBotRequest('GET', `/guilds/${guildId}?with_counts=true`),
          discordBotRequest('GET', `/guilds/${guildId}/roles`),
          discordBotRequest('GET', `/guilds/${guildId}/channels`),
        ]);

        if (guildRes.status === 200 && guildRes.body) {
          const g = guildRes.body;
          stats.memberCount = g.approximate_member_count ?? g.member_count ?? null;
          stats.onlineCount = g.approximate_presence_count ?? null;
          stats.verificationLevel = g.verification_level ?? null;
        }
        if (rolesRes.status === 200 && Array.isArray(rolesRes.body)) {
          stats.roleCount = rolesRes.body.length;
        }
        if (channelsRes.status === 200 && Array.isArray(channelsRes.body)) {
          stats.channelCount = channelsRes.body.length;
        }
      } catch (_) {
        // Stats fetch failed — return nulls
      }
    }

    res.json({ server, stats });
  }).catch((err) => {
    console.error('[discord/servers/:guildId]', err);
    res.status(500).json({ error: 'Failed to load server' });
  });
});

// PUT /api/discord/servers/:guildId/config — update server settings
router.put('/servers/:guildId/config', (req, res) => {
  const err = requireAuth(req, res);
  if (err) return;
  const { guildId } = req.params;

  getServerOwnership(guildId, req.session.userId)
    .then(async (server) => {
      if (!server) return res.status(403).json({ error: 'Not your server' });

      const allowed = [
        'auto_role_free', 'auto_role_creator', 'auto_role_pro',
        'welcome_channel_id', 'log_channel_id',
        'greetings_enabled', 'mod_commands_enabled',
        'anti_spam_enabled', 'anti_spam_threshold',
        'anti_raid_enabled', 'anti_raid_threshold', 'anti_raid_window',
        'invite_age_limit', 'verification_gate',
      ];
      const fields = {};
      for (const key of allowed) {
        if (key in req.body) fields[key] = req.body[key];
      }

      const config = await updateServerConfig(server.id, fields);
      console.log(JSON.stringify({ event: 'server_config_updated', guild_id: guildId, user_id: req.session.userId }));
      res.json({ config });
    })
    .catch((err) => {
      console.error('[discord/servers/:guildId/config PUT]', err);
      res.status(500).json({ error: 'Failed to update config' });
    });
});

// POST /api/discord/servers/:guildId/sync — force refresh stats from Discord API
router.post('/servers/:guildId/sync', (req, res) => {
  const err = requireAuth(req, res);
  if (err) return;
  const { guildId } = req.params;

  getServerOwnership(guildId, req.session.userId)
    .then((server) => {
      if (!server) return res.status(403).json({ error: 'Not your server' });
      return server;
    })
    .then(async (server) => {
      const botToken = process.env.DISCORD_BOT_TOKEN;
      if (!botToken) return res.status(503).json({ error: 'Discord bot not configured' });

      const guildRes = await discordBotRequest('GET', `/guilds/${guildId}?with_counts=true`);
      if (guildRes.status !== 200) return res.status(502).json({ error: 'Failed to fetch from Discord' });

      const g = guildRes.body;
      const stats = {
        memberCount: g.approximate_member_count ?? g.member_count ?? null,
        onlineCount: g.approximate_presence_count ?? null,
        verificationLevel: g.verification_level ?? null,
      };

      console.log(JSON.stringify({ event: 'server_synced', guild_id: guildId, stats }));
      res.json({ synced: true, stats });
    })
    .catch((err) => {
      console.error('[discord/servers/:guildId/sync]', err);
      res.status(500).json({ error: 'Sync failed' });
    });
});

// POST /api/discord/servers/:guildId/generate-invite — generate admin OAuth install link
router.post('/servers/:guildId/generate-invite', (req, res) => {
  const err = requireAuth(req, res);
  if (err) return;
  const { guildId } = req.params;

  getServerOwnership(guildId, req.session.userId)
    .then((server) => {
      if (!server) return res.status(403).json({ error: 'Not your server' });
      return server;
    })
    .then((server) => {
      const clientId = process.env.DISCORD_CLIENT_ID;
      if (!clientId) return res.status(500).json({ error: 'Discord client not configured' });

      const params = new URLSearchParams({
        client_id: clientId,
        permissions: '8',
        guild_id: guildId,
        scope: 'bot applications.commands',
      });
      const installUrl = `${INSTALL_BASE}?${params}`;
      console.log(JSON.stringify({ event: 'invite_generated', guild_id: guildId, user_id: req.session.userId }));
      res.json({ installUrl, guildId: server.guild_id, guildName: server.name });
    })
    .catch((err) => {
      console.error('[discord/servers/:guildId/generate-invite]', err);
      res.status(500).json({ error: 'Failed to generate invite' });
    });
});

module.exports = router;