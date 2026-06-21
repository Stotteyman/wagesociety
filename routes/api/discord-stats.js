// routes/api/discord-stats.js — Discord server stats and overview endpoints.
const express = require('express');
const router = express.Router();
const { getServerOwnership } = require('../../db/discord-servers');

// Bot client injected at app startup
let botClient = null;
router.setBotClient = (client) => { botClient = client; };

// ── Auth guard ──────────────────────────────────────────────────────────────
function requireAuth(req, res) {
  if (!req.session?.userId && !req.session?.userEmail) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  return null;
}

// ── Helper: get guild from bot client ─────────────────────────────────────
function getGuild(guildId) {
  if (!botClient?.ready) return Promise.resolve(null);
  return botClient.guilds.fetch(guildId).catch(() => null);
}

// ── GET /api/discord/servers/:guildId/stats ──────────────────────────────────
router.get('/:guildId/stats', async (req, res) => {
  const err = requireAuth(req, res);
  if (err) return;

  const { guildId } = req.params;

  const server = await getServerOwnership(guildId, req.session.userId);
  if (!server) return res.status(403).json({ error: 'Not your server' });

  const guild = await getGuild(guildId);
  if (!guild) return res.status(404).json({ error: 'Bot not in this server' });

  const channels = guild.channels.cache;
  const roles = guild.roles.cache;
  const members = guild.members.cache;
  const onlineCount = members.filter(m => m.presence?.status === 'online' || m.presence?.status === 'dnd' || m.presence?.status === 'idle').size;

  const categories = [...new Set(
    channels
      .filter(c => c.parentId && c.type === 0)
      .map(c => c.parent.name)
  )];

  res.json({
    memberCount: guild.memberCount,
    channelCount: channels.size,
    roleCount: roles.size,
    onlineCount,
    categories,
  });
});

// ── GET /api/discord/servers/:guildId/overview ───────────────────────────────
router.get('/:guildId/overview', async (req, res) => {
  const err = requireAuth(req, res);
  if (err) return;

  const { guildId } = req.params;

  const server = await getServerOwnership(guildId, req.session.userId);
  if (!server) return res.status(403).json({ error: 'Not your server' });

  const guild = await getGuild(guildId);
  if (!guild) return res.status(404).json({ error: 'Bot not in this server' });

  res.json({
    name: guild.name,
    icon: guild.iconURL({ size: 256, extension: 'png' }) || null,
    owner: guild.ownerId || null,
    region: guild.preferredLocale || null,
    features: guild.features || [],
    maxMembers: guild.maximumMembers || null,
    verificationLevel: guild.verificationLevel !== undefined ? String(guild.verificationLevel) : null,
  });
});

// ── GET /api/discord/servers/:guildId/channels ──────────────────────────────
router.get('/:guildId/channels', async (req, res) => {
  const err = requireAuth(req, res);
  if (err) return;

  const { guildId } = req.params;

  const server = await getServerOwnership(guildId, req.session.userId);
  if (!server) return res.status(403).json({ error: 'Not your server' });

  const guild = await getGuild(guildId);
  if (!guild) return res.status(404).json({ error: 'Bot not in this server' });

  const channels = guild.channels.cache
    .filter(c => c.type === 0 || c.type === 4 || c.type === 2 || c.type === 15) // text, category, voice, forum
    .map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      parentId: c.parentId || null,
      position: c.position,
    }));

  res.json({ channels });
});

// ── GET /api/discord/servers/:guildId/roles ─────────────────────────────────
router.get('/:guildId/roles', async (req, res) => {
  const err = requireAuth(req, res);
  if (err) return;

  const { guildId } = req.params;

  const server = await getServerOwnership(guildId, req.session.userId);
  if (!server) return res.status(403).json({ error: 'Not your server' });

  const guild = await getGuild(guildId);
  if (!guild) return res.status(404).json({ error: 'Bot not in this server' });

  const roles = guild.roles.cache
    .filter(r => !r.managed) // exclude bot integration roles
    .map(r => ({
      id: r.id,
      name: r.name,
      color: r.hexColor || null,
      position: r.position,
      permissions: String(r.permissions.bitfield),
      hoist: r.hoist,
    }));

  res.json({ roles });
});

module.exports = router;