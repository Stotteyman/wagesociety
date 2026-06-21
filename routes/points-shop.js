// routes/points-shop.js — Point Shop: browse items, purchase with points.
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../lib/middleware');
const { pool } = require('../db/index');
const {
  getActiveShopItems,
  getUserPurchases,
  purchaseItem,
} = require('../db/points-shop');

/** GET /point-shop — browse the shop (requires login). */
router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id;

  const [items, purchases, userRow] = await Promise.all([
    getActiveShopItems().catch(() => []),
    getUserPurchases(userId).catch(() => []),
    pool.query('SELECT referral_points, badges FROM auth_users WHERE id = $1', [userId]).catch(() => ({ rows: [{ referral_points: 0, badges: [] }] })),
  ]);

  const balance = userRow.rows[0]?.referral_points || 0;
  const badges  = userRow.rows[0]?.badges || [];
  const purchasedItemIds = new Set(purchases.map(p => p.item_id));

  const flash = req.query.success === '1' ? 'Item redeemed successfully!' : null;

  res.render('pages/point-shop', {
    items,
    balance,
    badges,
    purchases,
    purchasedItemIds: [...purchasedItemIds],
    flash,
  });
});

/** POST /point-shop/purchase — redeem a shop item for points. */
router.post('/purchase', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { item_id } = req.body;

  if (!item_id) {
    return res.redirect('/point-shop?error=' + encodeURIComponent('Invalid item.'));
  }

  const result = await purchaseItem(userId, item_id);

  if (!result.success) {
    const msg = encodeURIComponent(result.error || 'Purchase failed.');
    return res.redirect('/point-shop?error=' + msg);
  }

  return res.redirect('/point-shop?success=1');
});

module.exports = router;