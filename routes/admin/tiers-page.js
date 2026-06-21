// routes/admin/tiers-page.js — Admin membership tiers UI page.
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../../lib/middleware');

router.get('/', requireAdmin, (_req, res) => {
  res.render('pages/admin-tiers');
});

module.exports = router;