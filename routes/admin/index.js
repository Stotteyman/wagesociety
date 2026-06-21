// routes/admin/index.js — Main admin hub page.
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../../lib/middleware');

// GET /admin — main admin hub (stats + quick links)
router.get('/', requireAdmin, (_req, res) => {
  res.render('admin/index');
});

// GET /admin/referrals — referral management page
router.get('/referrals', requireAdmin, (_req, res) => {
  res.render('pages/admin-referrals');
});

module.exports = router;