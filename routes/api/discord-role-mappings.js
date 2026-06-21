// routes/api/discord-role-mappings.js — Admin role mapping + member management.
// Owns: listing Discord roles, saving tier→role mappings, guild member list, manual role edits.
// Does NOT own: actual role sync logic (lib/discord-sync.js).
const express = require('express');
const router = express.Router();
const https = require('https');
const { getServerOwnership, getServerByGuildId } = require('../../db/discord-servers');
const { getDiscordLinkByUserId } = require('../../db/discord');
const { getUserMembership } = require('../../db/memberships');
const { getUserByEmail } = require('../../db/users');

const DISCORD_API = 'https://discord.com/api/v10';

// In-memory role-name→ID cache per guild (populated on first fetch, refreshed on save)
const _roleCache = new Map(); // guildId → Map<roleNameLower, roleId>

// ── Low-level Discord bot API helper ──────────────────────────────────────────
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

// Fetch and cache Discord roles for a guild. Returns Map<name, {id, name, color}>.
async function fetchRoles(guildId) {
  const res = await discordBotRequest('GET', `/guilds/${guildId}/roles`);
  if (res.status !== 200 || !Array.isArray(res.body)) {
    return new Map();
  }
  const map = new Map();
  for (const role of res.body) {
    map.set(role.name.toLowerCase(), { id: role.id, name: role.name, color: role.color || 0 });
  }
  _roleCache.set(guildId, map);
  return map;
}

// Invalidate role cache when mappings are saved (next fetch will re-populate).
function invalidateCache(guildId) {
  _roleCache.delete(guildId);
}

// ── Auth guard ─────────────────────────────────────────────────────────────────
function requireAuth(req, res) {
  if (!req.session?.userId && !req.session?.userEmail) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  return null;
}

// ── GET /api/discord/role-mappings/:guildId ────────────────────────────────────
// Returns: { mappings: { free, creator, pro }, availableRoles: [...] }
router.get('/role-mappings/:guildId', (req, res) => {
  const err = requireAuth(req, res);
  if (err) return;

  const { guildId } = req.params;
  const userId = req.session.userId;

  getServerOwnership(guildId, userId).then(async (server) => {
    if (!server) return res.status(403).json({ error: 'Not your server' });

    // Fetch Discord roles
    const roleMap = await fetchRoles(guildId);
    const availableRoles = Array.from(roleMap.entries()).map(([, v]) => v);

    // Fetch server config
    const configRes = await require('../../db/index').pool.query(
      'SELECT tier_role_free, tier_role_creator, tier_role_pro FROM discord_server_configs WHERE server_id = $1',
      [server.id]
    );
    const cfg = configRes.rows[0] || {};

    res.json({
      mappings: {
        free:    cfg.tier_role_free   || 'Member',
        creator: cfg.tier_role_creator || 'Creator',
        pro:     cfg.tier_role_pro     || 'Pro',
      },
      availableRoles,
    });
  }).catch(err => {
    console.error('[role-mappings/get]', err);
    res.status(500).json({ error: 'Failed to load role mappings' });
  });
});

// ── PUT /api/discord/role-mappings/:guildId ────────────────────────────────────
// Body: { tier_role_free, tier_role_creator, tier_role_pro }
router.put('/role-mappings/:guildId', (req, res) => {
  const err = requireAuth(req, res);
  if (err) return;

  const { guildId } = req.params;
  const { tier_role_free, tier_role_creator, tier_role_pro } = req.body;
  const userId = req.session.userId;

  if (!tier_role_free && !tier_role_creator && !tier_role_pro) {
    return res.status(400).json({ error: 'At least one mapping required' });
  }

  getServerOwnership(guildId, userId).then(async (server) => {
    if (!server) return res.status(403).json({ error: 'Not your server' });

    // Update the config rows
    const fields = {};
    if (tier_role_free   !== undefined) fields.tier_role_free   = tier_role_free;
    if (tier_role_creator !== undefined) fields.tier_role_creator = tier_role_creator;
    if (tier_role_pro     !== undefined) fields.tier_role_pro     = tier_role_pro;

    const { updateServerConfig } = require('../../db/discord-servers');
    const config = await updateServerConfig(server.id, fields);

    // Invalidate role cache so next fetch re-populates
    invalidateCache(guildId);

    console.log(JSON.stringify({ event: 'role_mappings_saved', guild_id: guildId, fields }));
    res.json({ ok: true, mappings: fields });
  }).catch(err => {
    console.error('[role-mappings/put]', err);
    res.status(500).json({ error: 'Failed to save role mappings' });
  });
});

// ── GET /api/discord/guild-members/:guildId ────────────────────────────────────
// Lists members of the Discord guild with their WAGEOS tier.
// Returns: { members: [{ discordId, username, avatar, roles[], wageosTier, wageosEmail }] }
router.get('/guild-members/:guildId', (req, res) => {
  const err = requireAuth(req, res);
  if (err) return;

  const { guildId } = req.params;
  const { search } = req.query;
  const userId = req.session.userId;

  getServerOwnership(guildId, userId).then(async (server) => {
    if (!server) return res.status(403).json({ error: 'Not your server' });

    // Get guild members from Discord (limit 1000 for large guilds)
    const res2 = await discordBotRequest('GET', `/guilds/${guildId}/members?limit=1000`);
    if (res2.status !== 200 || !Array.isArray(res2.body)) {
      return res.status(502).json({ error: 'Failed to fetch guild members from Discord' });
    }

    let members = res2.body;

    // Filter by search query if provided
    if (search) {
      const q = search.toLowerCase();
      members = members.filter(m =>
        m.user?.username?.toLowerCase().includes(q) ||
        m.nick?.toLowerCase().includes(q)
      );
    }

    // Get all linked WAGEOS users to match discord IDs to tiers
    const linkRows = await require('../../db/discord').getAllLinkedUsers();
    const discordIdToUserId = new Map(linkRows.map(r => [r.discord_id, r.user_id]));

    // Build result array
    const result = members.map(m => ({
      discordId: m.user?.id,
      username: m.nick || m.user?.username || 'Unknown',
      avatar: m.user?.avatar
        ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png`
        : null,
      roles: m.roles || [],
      wageosTier: null,
      wageosEmail: null,
      wageosLinked: false,
    }));

    // Enrich with WAGEOS tier data (batch lookup by userId)
    const wageosUserIds = result
      .map(m => discordIdToUserId.get(m.discordId))
      .filter(Boolean);

    if (wageosUserIds.length > 0) {
      const userRows = await require('../../db/index').pool.query(
        'SELECT id, email FROM auth_users WHERE id = ANY($1)',
        [wageosUserIds]
      );
      const idToEmail = new Map(userRows.rows.map(r => [r.id, r.email]));

      const emails = Array.from(idToEmail.values());
      const membershipRows = await require('../../db/index').pool.query(
        `SELECT um.email, mp.slug as plan_slug
         FROM user_memberships um
         JOIN membership_plans mp ON mp.slug = um.plan_slug
         WHERE um.email = ANY($1) AND um.status IN ('active','trialing')`,
        [emails]
      );
      const emailToTier = new Map(membershipRows.rows.map(r => [r.email.toLowerCase(), r.plan_slug]));

      for (const m of result) {
        const userId2 = discordIdToUserId.get(m.discordId);
        if (userId2) {
          m.wageosLinked = true;
          const email = idToEmail.get(userId2);
          if (email) {
            m.wageosEmail = email;
            m.wageosTier = emailToTier.get(email.toLowerCase()) || 'free';
          }
        }
      }
    }

    res.json({ members: result, total: result.length });
  }).catch(err => {
    console.error('[guild-members/get]', err);
    res.status(500).json({ error: 'Failed to load guild members' });
  });
});

// ── POST /api/discord/guild-members/:guildId/roles ────────────────────────────
// Manually add or remove a Discord role for a member.
// Body: { discordId, action: 'add'|'remove', roleId }
router.post('/guild-members/:guildId/roles', (req, res) => {
  const err = requireAuth(req, res);
  if (err) return;

  const { guildId } = req.params;
  const { discordId, action, roleId } = req.body;
  const userId = req.session.userId;

  if (!discordId || !action || !roleId) {
    return res.status(400).json({ error: 'discordId, action, and roleId are required' });
  }
  if (!['add', 'remove'].includes(action)) {
    return res.status(400).json({ error: 'action must be "add" or "remove"' });
  }

  getServerOwnership(guildId, userId).then(async (server) => {
    if (!server) return res.status(403).json({ error: 'Not your server' });

    // Get current member roles
    const getRes = await discordBotRequest('GET', `/guilds/${guildId}/members/${discordId}`);
    if (getRes.status === 404) {
      return res.status(404).json({ error: 'Member not found in this server' });
    }

    let currentRoles = [];
    if (getRes.status === 200 && Array.isArray(getRes.body?.roles)) {
      currentRoles = getRes.body.roles;
    }

    let newRoles;
    if (action === 'add') {
      newRoles = [...new Set([...currentRoles, roleId])];
    } else {
      newRoles = currentRoles.filter(r => r !== roleId);
    }

    const patchRes = await discordBotRequest(
      'PATCH',
      `/guilds/${guildId}/members/${discordId}`,
      { roles: newRoles }
    );

    if (patchRes.status >= 200 && patchRes.status < 300) {
      console.log(JSON.stringify({ event: 'manual_role_edit', guild_id: guildId, discord_id: discordId, action, role_id: roleId }));
      res.json({ ok: true, newRoles });
    } else {
      res.status(502).json({ error: 'Discord API error', detail: patchRes.body });
    }
  }).catch(err => {
    console.error('[guild-members/roles]', err);
    res.status(500).json({ error: 'Failed to update roles' });
  });
});

module.exports = router;