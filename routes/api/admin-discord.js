// routes/api/admin-discord.js — API endpoints for the /admin/discord management page.
// Owns: server info, roles CRUD, channel setup, bot settings, tier map, logs.
// Does NOT own: Discord OAuth flows or individual user role sync.
const express = require('express');
const router = express.Router();
const https = require('https');
const { requireAdmin } = require('../../lib/middleware');
const db = require('../../db/discord-admin');

const DISCORD_API = 'https://discord.com/api/v10';

// ── Discord bot HTTP helper ────────────────────────────────────────────────
function discordReq(method, path, body) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return Promise.resolve({ status: 0, body: null, error: 'no_bot_token' });
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const url = new URL(DISCORD_API + path);
    const options = {
      hostname: url.hostname, path: url.pathname + url.search, method,
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

// ── GET /server — main server info from Discord API ────────────────────────
router.get('/server', requireAdmin, async (_req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return res.json({ configured: false });

  const [guildRes, rolesRes, channelsRes] = await Promise.all([
    discordReq('GET', `/guilds/${guildId}?with_counts=true`),
    discordReq('GET', `/guilds/${guildId}/roles`),
    discordReq('GET', `/guilds/${guildId}/channels`),
  ]);

  if (guildRes.status !== 200) {
    return res.json({ configured: true, connected: false, status: guildRes.status });
  }

  const linkedCount = await db.getLinkedUserCount();

  res.json({
    configured: true,
    connected: true,
    guild: {
      name: guildRes.body?.name || 'Unknown',
      id: guildId,
      memberCount: guildRes.body?.approximate_member_count ?? guildRes.body?.member_count ?? null,
      icon: guildRes.body?.icon
        ? `https://cdn.discordapp.com/icons/${guildId}/${guildRes.body.icon}.png?size=128`
        : null,
      verificationLevel: guildRes.body?.verification_level ?? null,
    },
    roles: Array.isArray(rolesRes.body) ? rolesRes.body.map(r => ({
      id: r.id,
      name: r.name,
      color: r.color || 0,
      colorHex: '#' + (r.color || 0).toString(16).padStart(6, '0'),
      position: r.position,
      hoist: r.hoist || false,
      mentionable: r.mentionable || false,
      managed: r.managed || false,
      memberCount: null, // Discord doesn't return this in roles list
    })).sort((a, b) => b.position - a.position) : [],
    channels: Array.isArray(channelsRes.body) ? channelsRes.body.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      parentId: c.parent_id || null,
      position: c.position,
    })).sort((a, b) => a.position - b.position) : [],
    linkedCount,
  });
});

// ── GET /roles — list roles from Discord ──────────────────────────────────
router.get('/roles', requireAdmin, async (_req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return res.status(400).json({ error: 'DISCORD_GUILD_ID not set' });

  const rolesRes = await discordReq('GET', `/guilds/${guildId}/roles`);
  if (rolesRes.status !== 200) return res.status(502).json({ error: 'Discord API error' });

  const roles = (rolesRes.body || []).map(r => ({
    id: r.id,
    name: r.name,
    color: r.color || 0,
    colorHex: '#' + (r.color || 0).toString(16).padStart(6, '0'),
    position: r.position,
    hoist: r.hoist || false,
    mentionable: r.mentionable || false,
    managed: r.managed || false,
  })).sort((a, b) => b.position - a.position);

  res.json({ roles });
});

// ── PUT /roles/:id — update a role on Discord ──────────────────────────────
router.put('/roles/:id', requireAdmin, async (req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return res.status(400).json({ error: 'DISCORD_GUILD_ID not set' });

  const { name, color, hoist, mentionable } = req.body;
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (color !== undefined) patch.color = typeof color === 'string' ? parseInt(color.replace('#', ''), 16) : color;
  if (hoist !== undefined) patch.hoist = !!hoist;
  if (mentionable !== undefined) patch.mentionable = !!mentionable;

  const result = await discordReq('PATCH', `/guilds/${guildId}/roles/${req.params.id}`, patch);
  if (result.status >= 200 && result.status < 300) {
    await db.insertLog('role_updated', { serverId: guildId, details: { roleId: req.params.id, ...patch } });
    res.json({ ok: true, role: result.body });
  } else {
    res.status(502).json({ error: 'Discord API error', detail: result.body });
  }
});

// ── DELETE /roles/:id — delete a role from Discord ─────────────────────────
router.delete('/roles/:id', requireAdmin, async (req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return res.status(400).json({ error: 'DISCORD_GUILD_ID not set' });

  const result = await discordReq('DELETE', `/guilds/${guildId}/roles/${req.params.id}`);
  if (result.status === 204 || result.status === 200) {
    await db.insertLog('role_deleted', { serverId: guildId, details: { roleId: req.params.id } });
    res.json({ ok: true });
  } else {
    res.status(502).json({ error: 'Discord API error', detail: result.body });
  }
});

// ── POST /roles/sync — push local changes to Discord ──────────────────────
router.post('/roles/sync', requireAdmin, async (req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return res.status(400).json({ error: 'DISCORD_GUILD_ID not set' });

  const { roles } = req.body; // array of { id, name, color, hoist, mentionable }
  if (!Array.isArray(roles)) return res.status(400).json({ error: 'roles array required' });

  const results = [];
  for (const role of roles) {
    const patch = {};
    if (role.name) patch.name = role.name;
    if (role.color !== undefined) patch.color = typeof role.color === 'string' ? parseInt(role.color.replace('#', ''), 16) : role.color;
    if (role.hoist !== undefined) patch.hoist = !!role.hoist;
    if (role.mentionable !== undefined) patch.mentionable = !!role.mentionable;

    const result = await discordReq('PATCH', `/guilds/${guildId}/roles/${role.id}`, patch);
    results.push({ id: role.id, ok: result.status >= 200 && result.status < 300, status: result.status });
  }

  await db.insertLog('roles_synced', { serverId: guildId, details: { count: roles.length } });
  res.json({ ok: true, results });
});

// ── GET /channels — list channels ─────────────────────────────────────────
router.get('/channels', requireAdmin, async (_req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return res.status(400).json({ error: 'DISCORD_GUILD_ID not set' });

  const channelsRes = await discordReq('GET', `/guilds/${guildId}/channels`);
  if (channelsRes.status !== 200) return res.status(502).json({ error: 'Discord API error' });

  const channels = (channelsRes.body || []).map(c => ({
    id: c.id,
    name: c.name,
    type: c.type,
    parentId: c.parent_id || null,
    position: c.position,
  })).sort((a, b) => a.position - b.position);

  res.json({ channels });
});

// ── POST /channels/setup — create missing channels per the channel matrix ─
router.post('/channels/setup', requireAdmin, async (_req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return res.status(400).json({ error: 'DISCORD_GUILD_ID not set' });

  // Fetch existing channels
  const channelsRes = await discordReq('GET', `/guilds/${guildId}/channels`);
  if (channelsRes.status !== 200) return res.status(502).json({ error: 'Failed to fetch channels' });

  const existing = new Map((channelsRes.body || []).map(c => [c.name.toLowerCase(), c]));
  const created = [];
  const skipped = [];

  // Channel structure spec: [category, [channels]]
  // Type 4 = category, Type 0 = text
  const structure = [
    ['📢 information', ['rules', 'announcements', 'verify']],
    ['💬 general', ['general', 'introductions', 'off-topic', 'memes']],
    ['🎮 creators', ['creator-chat', 'collabs', 'promo']],
    ['💎 vip', ['pro-lounge', 'elite-lounge', 'unlimited-lounge']],
    ['🎬 streams', ['stream-announcements', 'stream-chat']],
    ['👑 staff', ['staff-chat', 'admin-log', 'mod-actions']],
    ['🤖 bot', ['bot-commands', 'welcome']],
  ];

  for (const [catName, channels] of structure) {
    // Create category if missing
    let category = existing.get(catName.toLowerCase());
    if (!category) {
      const catRes = await discordReq('POST', `/guilds/${guildId}/channels`, {
        name: catName, type: 4, // Category
      });
      if (catRes.status >= 200 && catRes.status < 300) {
        category = catRes.body;
        created.push({ name: catName, type: 'category' });
      }
    } else {
      skipped.push({ name: catName, type: 'category' });
    }

    // Create text channels under this category
    for (const chName of channels) {
      if (existing.get(chName.toLowerCase())) {
        skipped.push({ name: chName, type: 'text' });
        continue;
      }
      const chRes = await discordReq('POST', `/guilds/${guildId}/channels`, {
        name: chName,
        type: 0, // Text
        parent_id: category?.id || null,
      });
      if (chRes.status >= 200 && chRes.status < 300) {
        created.push({ name: chName, type: 'text' });
      }
    }
  }

  await db.insertLog('channel_setup', { serverId: guildId, details: { created: created.length, skipped: skipped.length } });
  res.json({ ok: true, created, skipped });
});

// ── POST /channels/verify — recreate #verify channel ──────────────────────
router.post('/channels/verify', requireAdmin, async (_req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return res.status(400).json({ error: 'DISCORD_GUILD_ID not set' });

  // Use ensureRoles which also handles verify channel
  const { ensureRoles } = require('../../lib/ensure-discord-roles');
  const botToken = process.env.DISCORD_BOT_TOKEN;
  try {
    const result = await ensureRoles(botToken, guildId, require('../../db/index').pool);
    await db.insertLog('verify_recreated', { serverId: guildId });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /bot/status — bot connection status ────────────────────────────────
router.get('/bot/status', requireAdmin, async (_req, res) => {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!botToken) return res.json({ connected: false, reason: 'no_token' });

  const userRes = await discordReq('GET', '/users/@me');
  const settings = await db.getAllSettings();

  res.json({
    connected: userRes.status === 200,
    bot: userRes.status === 200 ? {
      username: userRes.body?.username,
      discriminator: userRes.body?.discriminator,
      avatar: userRes.body?.avatar
        ? `https://cdn.discordapp.com/avatars/${userRes.body.id}/${userRes.body.avatar}.png`
        : null,
      id: userRes.body?.id,
    } : null,
    guildId: guildId || null,
    settings,
  });
});

// ── GET /bot/settings — bot settings ──────────────────────────────────────
router.get('/bot/settings', requireAdmin, async (_req, res) => {
  const settings = await db.getAllSettings();
  res.json({ settings });
});

// ── PUT /bot/settings — update bot settings ───────────────────────────────
router.put('/bot/settings', requireAdmin, async (req, res) => {
  const allowed = [
    'auto_assign_on_oauth', 'role_sync_frequency', 'kick_unlinked',
    'dm_on_role_change', 'welcome_message_enabled', 'welcome_message_text',
    'verify_embed_text', 'everyone_lockdown', 'auto_role_on_join',
  ];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid settings provided' });
  }

  await db.setSettingsBulk(updates);
  await db.insertLog('settings_updated', { details: updates });
  const settings = await db.getAllSettings();
  res.json({ ok: true, settings });
});

// ── GET /bot/tier-map — tier → role mapping ───────────────────────────────
router.get('/bot/tier-map', requireAdmin, async (_req, res) => {
  const map = await db.getTierRoleMap();
  res.json({ map });
});

// ── PUT /bot/tier-map — update tier → role mapping ────────────────────────
router.put('/bot/tier-map', requireAdmin, async (req, res) => {
  const { mappings } = req.body; // [{ tier, discord_role_name, discord_role_id }]
  if (!Array.isArray(mappings)) return res.status(400).json({ error: 'mappings array required' });

  for (const m of mappings) {
    if (!m.tier || !m.discord_role_name) continue;
    await db.upsertTierRole(m.tier, m.discord_role_name, m.discord_role_id);
  }
  await db.insertLog('tier_map_updated', { details: { count: mappings.length } });
  const map = await db.getTierRoleMap();
  res.json({ ok: true, map });
});

// ── POST /bot/sync-all — trigger full role sync ───────────────────────────
router.post('/bot/sync-all', requireAdmin, async (req, res) => {
  const { getAllLinkedUsers } = require('../../db/discord');
  const { syncDiscordRole } = require('../../lib/discord-sync');

  const rows = await getAllLinkedUsers();
  const results = [];
  for (const row of rows) {
    const result = await syncDiscordRole(row.user_id).catch(err => ({
      synced: false, reason: 'exception', error: err.message,
    }));
    results.push({ user_id: row.user_id, email: row.email, ...result });
  }

  const synced = results.filter(r => r.synced).length;
  const failed = results.filter(r => !r.synced && r.reason !== 'not_linked' && r.reason !== 'missing_env').length;
  const skipped = results.filter(r => !r.synced && (r.reason === 'not_linked' || r.reason === 'missing_env')).length;

  await db.insertLog('sync_completed', { details: { total: rows.length, synced, failed, skipped } });
  res.json({ total: rows.length, synced, failed, skipped, results });
});

// ── GET /servers — list all servers bot is in ─────────────────────────────
router.get('/servers', requireAdmin, async (_req, res) => {
  // We only track the main guild; future expansion would list all
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return res.json({ servers: [] });

  const guildRes = await discordReq('GET', `/guilds/${guildId}?with_counts=true`);
  if (guildRes.status !== 200) return res.json({ servers: [] });

  res.json({
    servers: [{
      id: guildId,
      name: guildRes.body?.name,
      memberCount: guildRes.body?.approximate_member_count ?? null,
      icon: guildRes.body?.icon
        ? `https://cdn.discordapp.com/icons/${guildId}/${guildRes.body.icon}.png?size=64`
        : null,
      primary: true,
    }],
  });
});

// ── GET /channels/:id/permissions — get permission overwrites for a channel ─
router.get('/channels/:id/permissions', requireAdmin, async (req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return res.status(400).json({ error: 'DISCORD_GUILD_ID not set' });

  const result = await discordReq('GET', `/channels/${req.params.id}`);
  if (result.status !== 200) return res.status(502).json({ error: 'Failed to fetch channel' });

  const channel = result.body;
  res.json({
    channelId: channel.id,
    channelName: channel.name,
    channelType: channel.type,
    overwrites: (channel.permission_overwrites || []).map(o => ({
      id: o.id,
      type: o.type,
      allow: o.allow || 0,
      deny: o.deny || 0,
    })),
  });
});

// ── PUT /channels/:id/permissions — update permission overwrites for a channel ─
router.put('/channels/:id/permissions', requireAdmin, async (req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return res.status(400).json({ error: 'DISCORD_GUILD_ID not set' });

  const { overwrites } = req.body;
  if (!Array.isArray(overwrites)) return res.status(400).json({ error: 'overwrites array required' });

  const channelId = req.params.id;
  const errors = [];

  for (const ow of overwrites) {
    if (!ow.id) continue;
    const allow = parseInt(ow.allow) || 0;
    const deny = parseInt(ow.deny) || 0;

    const result = await discordReq('PATCH', `/channels/${channelId}`, {
      permission_overwrites: [{ id: ow.id, type: ow.type, allow, deny }],
    });

    if (result.status < 200 || result.status >= 300) {
      errors.push({ id: ow.id, error: result.body?.message || 'Discord API error' });
    }
  }

  await db.insertLog('discord_permission', { serverId: guildId, details: { channelId, changes: overwrites.length } });
  if (errors.length > 0) {
    res.json({ ok: false, partial: true, errors, channelId });
  } else {
    res.json({ ok: true, channelId });
  }
});

// ── POST /channels — create a new channel ──────────────────────────────────
router.post('/channels', requireAdmin, async (req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return res.status(400).json({ error: 'DISCORD_GUILD_ID not set' });

  const { name, type, parentId, topic } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });

  const body = { name: name.trim(), type: parseInt(type) || 0 };
  if (parentId) body.parent_id = parentId;
  if (topic) body.topic = topic;

  const result = await discordReq('POST', `/guilds/${guildId}/channels`, body);
  if (result.status >= 200 && result.status < 300) {
    await db.insertLog('discord_channel', { serverId: guildId, details: { action: 'create', name: name.trim() } });
    res.json({ ok: true, channel: result.body });
  } else {
    res.status(502).json({ error: result.body?.message || 'Discord API error' });
  }
});

// ── PATCH /channels/:id — rename or move a channel ──────────────────────────
router.patch('/channels/:id', requireAdmin, async (req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return res.status(400).json({ error: 'DISCORD_GUILD_ID not set' });

  const { name, parentId, position } = req.body;
  const patch = {};
  if (name) patch.name = name;
  if (parentId !== undefined) patch.parent_id = parentId || null;
  if (position !== undefined) patch.position = position;

  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No changes provided' });

  const result = await discordReq('PATCH', `/channels/${req.params.id}`, patch);
  if (result.status >= 200 && result.status < 300) {
    await db.insertLog('discord_channel', { serverId: guildId, details: { action: 'update', channelId: req.params.id, ...patch } });
    res.json({ ok: true, channel: result.body });
  } else {
    res.status(502).json({ error: result.body?.message || 'Discord API error' });
  }
});

// ── DELETE /channels/:id — delete a channel ─────────────────────────────────
router.delete('/channels/:id', requireAdmin, async (req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return res.status(400).json({ error: 'DISCORD_GUILD_ID not set' });

  const result = await discordReq('DELETE', `/channels/${req.params.id}`);
  if (result.status === 204 || result.status === 200) {
    await db.insertLog('discord_channel', { serverId: guildId, details: { action: 'delete', channelId: req.params.id } });
    res.json({ ok: true });
  } else {
    res.status(502).json({ error: result.body?.message || 'Discord API error' });
  }
});

// ── GET /logs — paginated bot activity logs ───────────────────────────────
router.get('/logs', requireAdmin, async (req, res) => {
  const event = req.query.event || null;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const offset = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    db.getLogs({ event, limit, offset }),
    db.getLogCount(event),
  ]);

  res.json({ logs, total, page, limit, pages: Math.ceil(total / limit) });
});

// ── POST /sync-structure — sync full server structure + run inheritance audit ─
router.post('/sync-structure', requireAdmin, async (req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return res.status(400).json({ error: 'DISCORD_GUILD_ID not set' });

  const [rolesRes, channelsRes] = await Promise.all([
    discordReq('GET', `/guilds/${guildId}/roles`),
    discordReq('GET', `/guilds/${guildId}/channels`),
  ]);

  if (rolesRes.status !== 200 || channelsRes.status !== 200) {
    return res.status(502).json({
      error: 'Discord API error',
      roles_status: rolesRes.status,
      channels_status: channelsRes.status,
    });
  }

  const { syncStructure, auditInheritance, getLatestAudit } = require('../../db/discord-structure');

  // Step 1: upsert everything into discord_server_structure
  const diff = await syncStructure(guildId, {
    roles: Array.isArray(rolesRes.body) ? rolesRes.body : [],
    channels: Array.isArray(channelsRes.body) ? channelsRes.body : [],
  });

  // Step 2: audit the inheritance chain
  const audit = await auditInheritance(guildId);

  // Step 3: log the sync event
  await db.insertLog('structure_synced', {
    serverId: guildId,
    details: {
      roles: rolesRes.body?.length || 0,
      channels: channelsRes.body?.length || 0,
      violations: audit.violations.length,
      status: audit.status,
    },
  });

  const latestAudit = await getLatestAudit(guildId);

  res.json({
    ok: true,
    diff,
    audit: {
      status: audit.status,
      violations: audit.violations,
      totalRoles: audit.totalRoles,
      totalChannels: audit.totalChannels,
      auditId: latestAudit?.id || null,
      checkedAt: latestAudit?.checked_at || null,
    },
    structure: {
      rolesCount: rolesRes.body?.length || 0,
      channelsCount: channelsRes.body?.length || 0,
    },
  });
});

// ── POST /categories — create a category ────────────────────────────────────
router.post('/categories', requireAdmin, async (req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return res.status(400).json({ error: 'DISCORD_GUILD_ID not set' });

  const { name, position } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });

  const body = { name: name.trim(), type: 4 };
  if (position !== undefined) body.position = position;

  const result = await discordReq('POST', `/guilds/${guildId}/channels`, body);
  if (result.status >= 200 && result.status < 300) {
    await db.insertLog('discord_category', { serverId: guildId, details: { action: 'create', name: name.trim() } });
    res.json({ ok: true, category: result.body });
  } else {
    res.status(502).json({ error: result.body?.message || 'Discord API error' });
  }
});

// ── PATCH /categories/:id — rename or reorder a category ─────────────────────
router.patch('/categories/:id', requireAdmin, async (req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return res.status(400).json({ error: 'DISCORD_GUILD_ID not set' });

  const { name, position } = req.body;
  const patch = {};
  if (name) patch.name = name;
  if (position !== undefined) patch.position = position;

  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No changes provided' });

  const result = await discordReq('PATCH', `/channels/${req.params.id}`, patch);
  if (result.status >= 200 && result.status < 300) {
    await db.insertLog('discord_category', { serverId: guildId, details: { action: 'update', categoryId: req.params.id, ...patch } });
    res.json({ ok: true, category: result.body });
  } else {
    res.status(502).json({ error: result.body?.message || 'Discord API error' });
  }
});

// ── DELETE /categories/:id — delete a category ────────────────────────────────
router.delete('/categories/:id', requireAdmin, async (req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return res.status(400).json({ error: 'DISCORD_GUILD_ID not set' });

  const result = await discordReq('DELETE', `/channels/${req.params.id}`);
  if (result.status === 204 || result.status === 200) {
    await db.insertLog('discord_category', { serverId: guildId, details: { action: 'delete', categoryId: req.params.id } });
    res.json({ ok: true });
  } else {
    res.status(502).json({ error: result.body?.message || 'Discord API error' });
  }
});

// ── POST /channels/:id/reorder — reorder a channel within a category ──────────
router.post('/channels/:id/reorder', requireAdmin, async (req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return res.status(400).json({ error: 'DISCORD_GUILD_ID not set' });

  const { position, parentId } = req.body;
  const patch = {};
  if (position !== undefined) patch.position = position;
  if (parentId !== undefined) patch.parent_id = parentId || null;

  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No changes provided' });

  const result = await discordReq('PATCH', `/channels/${req.params.id}`, patch);
  if (result.status >= 200 && result.status < 300) {
    await db.insertLog('discord_channel', { serverId: guildId, details: { action: 'reorder', channelId: req.params.id, ...patch } });
    res.json({ ok: true, channel: result.body });
  } else {
    res.status(502).json({ error: result.body?.message || 'Discord API error' });
  }
});

// ── GET /audit — get latest audit result ─────────────────────────────────────
router.get('/audit', requireAdmin, async (req, res) => {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return res.status(400).json({ error: 'DISCORD_GUILD_ID not set' });

  const { getLatestAudit, getStoredStructure } = require('../../db/discord-structure');
  const audit = await getLatestAudit(guildId);
  const structure = await getStoredStructure(guildId);

  res.json({
    audit,
    structure: {
      roles: structure.filter(e => e.entity_type === 'role'),
      categories: structure.filter(e => e.entity_type === 'category'),
      channels: structure.filter(e => e.entity_type === 'channel'),
    },
  });
});

module.exports = router;
