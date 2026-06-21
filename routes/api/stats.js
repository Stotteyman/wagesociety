// routes/api/stats.js — Public API for landing page stats + live creators.
// Does NOT own auth or user data. Read-only aggregate endpoints.
const express = require('express');
const router = express.Router();
const { getHomepageStats, getLiveCreators, getHudStats } = require('../../db/platform-stats');

// GET /api/stats — landing page stats + live creators (same data as homepage)
router.get('/', async (_req, res) => {
  try {
    const [stats, liveCreators] = await Promise.all([
      getHomepageStats(),
      getLiveCreators(10),
    ]);
    res.json({ stats, liveCreators });
  } catch (err) {
    console.error('[/api/stats]', err.message);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// GET /api/homepage-stats — lightweight HUD data for Three.js portal overlay
// Polled every 30s by wage-three.js. Returns only the HUD-visible fields.
router.get('/homepage-stats', async (_req, res) => {
  try {
    const hud = await getHudStats();
    res.json(hud);
  } catch (err) {
    console.error('[/api/stats/homepage-stats]', err.message);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

module.exports = router;
