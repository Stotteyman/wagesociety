// bot/periodic-sync.js — Periodic guild sync every 30 minutes.
// Runs only when ENABLE_IN_PROCESS_CRONS === 'true', so that exactly one host
// runs the schedule when several are up. The old name for this flag was
// POLSIA_IN_PROCESS_CRONS_ENABLED and is still read as a fallback.
// The external cron host set that flag to 'false' and ran bot/periodic-sync-trigger.js
// instead — exactly one of the two must be live. See docs/CRON_SCHEDULES.md.

const { RateLimiter } = require('./rate-limiter');

const rl = new RateLimiter();

// Empty string counts as unset, so `||` is deliberate here — `??` would let a
// blank Netlify variable mask the old name instead of falling through to it.
function inProcessCronsEnabled() {
  return (process.env.ENABLE_IN_PROCESS_CRONS
    || process.env.POLSIA_IN_PROCESS_CRONS_ENABLED) === 'true';
}

function startPeriodicSync(botClient, { pool, fetchGuild, upsertServer, updateServerConfig }) {
  if (!inProcessCronsEnabled()) {
    console.log(JSON.stringify({ event: 'periodic_sync_skip', reason: 'not_enabled_on_this_host' }));
    return null;
  }

  const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

  const timer = setInterval(async () => {
    await syncAllServers(botClient, { pool, fetchGuild, upsertServer, updateServerConfig });
  }, INTERVAL_MS);

  // Run once on startup
  setTimeout(async () => {
    await syncAllServers(botClient, { pool, fetchGuild, upsertServer, updateServerConfig });
  }, 5000);

  console.log(JSON.stringify({ event: 'periodic_sync_started', interval_ms: INTERVAL_MS }));
  return timer;
}

async function syncAllServers(botClient, { pool, fetchGuild, upsertServer, updateServerConfig }) {
  if (!botClient?.ready) return;

  const start = Date.now();
  try {
    const rows = await pool.query(
      `SELECT guild_id, name FROM discord_servers WHERE connected_at IS NOT NULL`
    );

    let synced = 0;
    for (const row of rows.rows) {
      try {
        const guild = await rl.exec(() =>
          botClient.guilds.fetch(row.guild_id).catch(() => null)
        );
        if (!guild) continue;

        await upsertServer({
          guildId: guild.id,
          name: guild.name,
          iconUrl: guild.iconURL({ size: 256, extension: 'png' }) || null,
          ownerDiscordId: guild.ownerId || null,
        });

        // Update member_count in discord_servers
        await pool.query(
          `UPDATE discord_servers SET member_count = $2, last_sync_at = NOW(), updated_at = NOW()
           WHERE guild_id = $1`,
          [guild.id, guild.memberCount || null]
        );

        synced++;
      } catch (err) {
        console.error(JSON.stringify({ event: 'sync_server_error', guild_id: row.guild_id, error: err.message }));
      }
    }

    console.log(JSON.stringify({ event: 'periodic_sync_complete', synced, duration_ms: Date.now() - start }));
  } catch (err) {
    console.error(JSON.stringify({ event: 'periodic_sync_error', error: err.message }));
  }
}

// Manual trigger: exposed as HTTP endpoint for Blaxel/webhook use
async function triggerSync(botClient, deps) {
  return syncAllServers(botClient, deps);
}

module.exports = { startPeriodicSync, triggerSync };