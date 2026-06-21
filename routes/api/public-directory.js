// routes/api/public-directory.js — Public creator directory.
const express = require('express');
const router = express.Router();
const { getPublicDirectory } = require('../../db/profiles');

router.get('/', async (req, res) => {
  try {
    const search = req.query.search || '';
    const sort = ['recent', 'alpha', 'tier'].includes(req.query.sort) ? req.query.sort : 'recent';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(parseInt(req.query.limit) || 20, 100);
    const result = await getPublicDirectory({ search, sort, page, perPage });
    // Strip email from public API response — privacy protection
    const entries = result.members.map(({ email, ...rest }) => rest);
    res.json({ entries, total: result.total, page: result.page, perPage: result.perPage });
  } catch (err) {
    console.error('[/api/public-directory]', err);
    res.status(500).json({ error: 'Failed to load directory' });
  }
});

module.exports = router;