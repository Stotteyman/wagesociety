// lib/start-bot.js — Discord bot startup wiring.
// Owns: creating the bot client, wiring stats route, periodic sync, manual sync endpoint.
// Does NOT own: bot event handlers (bot/discord-bot.js), sync logic (lib/discord-sync.js).

const { pool } = require('../db/index');

function startBot(app) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.log('[Discord] DISCORD_BOT_TOKEN not set — bot not started');
    return null;
  }

  const {
    upsertServer,
    markServerConnected,
    createDefaultConfig,
    updateServerMemberCount,
    updateWageRoleId,
  } = require('../db/discord-servers');
  const { getAllLinkedDiscordIds, getDiscordLinkByDiscordId } = require('../db/discord');

  const { createBot } = require('../bot/discord-bot');
  const botClient = createBot(token, {
    pool,
    upsertServer,
    markServerConnected,
    createDefaultConfig,
    updateServerMemberCount,
    updateWageRoleId,
    getAllLinkedDiscordIds,
    getDiscordLinkByDiscordId,
  });

  // Wire bot into stats route so it can fetch guilds
  const statsRouter = require('../routes/api/discord-stats');
  statsRouter.setBotClient(botClient);

  // Start periodic guild sync (guarded — Blaxel shadow sets env to false)
  const { startPeriodicSync, triggerSync } = require('../bot/periodic-sync');
  startPeriodicSync(botClient, { pool, upsertServer, createDefaultConfig });

  // Expose manual sync trigger for webhook use
  app.post('/api/discord/sync-all', async (req, res) => {
    const secret = process.env.DISCORD_WEBHOOK_SECRET;
    if (secret && req.headers['x-webhook-secret'] !== secret) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await triggerSync(botClient, { pool, upsertServer, createDefaultConfig });
    res.json({ ok: true });
  });

  console.log('[Discord] Bot initialized');
  return botClient;
}

module.exports = { startBot };
