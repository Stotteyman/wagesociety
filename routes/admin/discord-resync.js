// routes/admin/discord-resync.js — Admin Discord role resync endpoint.
// Owns: POST /admin/discord/resync-all (superadmin) — loops all linked users and fires syncDiscordRole.
// Does NOT own individual sync logic (lives in lib/discord-sync.js) or auth (session via server.js).
const express = require('express');
const router = express.Router();
const { getMemberAccess } = require('../../db/orgAccess');
const { getAllLinkedUsers } = require('../../db/discord');
const { syncDiscordRole } = require('../../lib/discord-sync');

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

// POST /admin/discord/resync-all — re-sync every linked user's Discord role.
// Returns a JSON report: { total, synced, skipped, failed, results[] }
router.post('/resync-all', requireSuperadmin, async (req, res) => {
  try {
    // Fetch all users who have a discord link
    const rows = await getAllLinkedUsers();

    const results = [];
    for (const row of rows) {
      const syncResult = await syncDiscordRole(row.user_id).catch(err => ({
        synced: false,
        reason: 'exception',
        error: err.message,
      }));
      results.push({ user_id: row.user_id, email: row.email, ...syncResult });
    }

    const synced  = results.filter(r => r.synced).length;
    const failed  = results.filter(r => !r.synced && r.reason !== 'not_linked' && r.reason !== 'missing_env').length;
    const skipped = results.filter(r => !r.synced && (r.reason === 'not_linked' || r.reason === 'missing_env')).length;

    console.log(JSON.stringify({
      event: 'discord_resync_all',
      total: rows.length,
      synced,
      failed,
      skipped,
      triggered_by: req.session.userEmail,
    }));

    res.json({ total: rows.length, synced, failed, skipped, results });
  } catch (err) {
    console.error('[admin/discord-resync]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
