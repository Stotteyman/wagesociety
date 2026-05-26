// routes/api/public-directory.js — Public creator directory.
const express = require('express');
const router = express.Router();
const { getPublicDirectory } = require('../../db/profiles');

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 500, 500);
    const entries = await getPublicDirectory(limit);
    res.json({ entries });
  } catch (err) {
    console.error('[/api/public-directory]', err);
    res.status(500).json({ error: 'Failed to load directory' });
  }
});

module.exports = router;