// routes/admin/discord-resync.js — Admin Discord page + resync endpoints.
// Owns: GET /admin/discord (admin panel), POST /admin/discord/resync-all,
//       POST /admin/discord/reset-setup, GET /admin/discord/status (live bot status).
// Does NOT own individual sync logic (lives in lib/discord-sync.js).
const express = require('express');
const router = express.Router();
const https  = require('https');
const { getMemberAccess } = require('../../db/orgAccess');
const { getAllLinkedUsers } = require('../../db/discord');
const { syncDiscordRole } = require('../../lib/discord-sync');
const { ensureRoles } = require('../../lib/ensure-discord-roles');
const { pool } = require('../../db/index');

function requireSuperadmin(req, res, next) {
  const email = req.session?.userEmail;
  if (!email) return res.status(401).json({ error: 'Not authenticated' });
  getMemberAccess(email)
    .then(access => {
      if (access.role === 'superadmin') return next();
      return res.status(403).json({ error: 'Superadmin access required' });
    })
    .catch(() => res.status(500).json({ error: 'Auth check failed' }));
}

// ── Page — renders the 4-tab Discord management page ────────────────────────
router.get('/', requireSuperadmin, async (_req, res) => {
  // All data now loads client-side via /api/admin/discord/* endpoints
  res.render('admin/discord');
});

// ── GET /admin/discord/status — live bot + server status from Discord API ──────
router.get('/status', requireSuperadmin, async (req, res) => {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId  = process.env.DISCORD_GUILD_ID;

  if (!botToken || !guildId) {
    return res.json({ configured: false, error: 'DISCORD_BOT_TOKEN or DISCORD_GUILD_ID not set' });
  }

  function discordReq(method, path) {
    return new Promise((resolve) => {
      const { hostname, pathname } = new URL('https://discord.com/api/v10' + path);
      const req = https.request({ hostname, path: pathname, method, headers: { Authorization: `Bot ${botToken}`, 'User-Agent': 'WageOSBot/1.0' } }, (r) => {
        let d = ''; r.on('data', c => { d += c; }); r.on('end', () => { try { resolve({ status: r.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: r.statusCode, body: d }); } });
      });
      req.on('error', err => resolve({ status: 0, body: null, error: err.message }));
      req.end();
    });
  }

  try {
    const [guildRes, rolesRes] = await Promise.all([
      discordReq('GET', `/guilds/${guildId}?with_counts=true`),
      discordReq('GET', `/guilds/${guildId}/roles`),
    ]);

    if (guildRes.status !== 200) {
      return res.json({ configured: true, connected: false, status: guildRes.status });
    }

    const setupRow = await pool.query(
      "SELECT value, updated_at FROM discord_bot_state WHERE key = 'server_setup_complete'"
    ).catch(() => ({ rows: [] }));

    res.json({
      configured: true,
      connected: true,
      guild: {
        name: guildRes.body?.name || 'Unknown',
        memberCount: guildRes.body?.approximate_member_count ?? guildRes.body?.member_count ?? null,
        icon: guildRes.body?.icon ? `https://cdn.discordapp.com/icons/${guildId}/${guildRes.body.icon}.png` : null,
        verificationLevel: guildRes.body?.verification_level ?? null,
      },
      roles: Array.isArray(rolesRes.body) ? rolesRes.body.length : null,
      setupComplete: setupRow.rows[0]?.value === 'true',
      setupUpdatedAt: setupRow.rows[0]?.updated_at || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/discord/resync-all — re-sync every linked user's Discord role.
router.post('/resync-all', requireSuperadmin, async (req, res) => {
  try {
    const rows = await getAllLinkedUsers();
    const results = [];
    for (const row of rows) {
      const syncResult = await syncDiscordRole(row.user_id).catch(err => ({
        synced: false, reason: 'exception', error: err.message,
      }));
      results.push({ user_id: row.user_id, email: row.email, ...syncResult });
    }
    const synced  = results.filter(r => r.synced).length;
    const failed  = results.filter(r => !r.synced && r.reason !== 'not_linked' && r.reason !== 'missing_env').length;
    const skipped = results.filter(r => !r.synced && (r.reason === 'not_linked' || r.reason === 'missing_env')).length;
    console.log(JSON.stringify({ event: 'discord_resync_all', total: rows.length, synced, failed, skipped, triggered_by: req.session.userEmail }));
    res.json({ total: rows.length, synced, failed, skipped, results });
  } catch (err) {
    console.error('[admin/discord-resync]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/discord/reset-setup — clear setup flag and re-run ensureRoles.
router.post('/reset-setup', requireSuperadmin, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO discord_bot_state (key, value, updated_at)
       VALUES ('server_setup_complete', 'false', NOW())
       ON CONFLICT (key) DO UPDATE SET value = 'false', updated_at = NOW()`
    );
    const botToken = process.env.DISCORD_BOT_TOKEN;
    const guildId  = process.env.DISCORD_GUILD_ID;
    if (!botToken || !guildId) {
      return res.status(400).json({ error: 'DISCORD_BOT_TOKEN / DISCORD_GUILD_ID not set' });
    }
    const result = await ensureRoles(botToken, guildId, pool);
    res.json({ ok: true, result });
  } catch (err) {
    console.error('[admin/discord-resync] reset-setup error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;