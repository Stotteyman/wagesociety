// routes/referrals.js — Referral leaderboard page + referral dashboard.
// Owns: GET /leaderboard, GET /dashboard/referrals.
// Does NOT own: signup processing (routes/auth-custom.js), point redemption (shop).
const express = require('express');
const router = express.Router();

const {
  getMonthlyLeaderboard,
  getUserReferralStats,
} = require('../db/referrals');

const { pool } = require('../db/index');

// Point packs: available for direct purchase via Stripe
const POINT_PACKS = [
  { id: 'pts_500',   label: '500 Points',    points: 500,  cents: 500  },
  { id: 'pts_1200',  label: '1,200 Points',  points: 1200, cents: 1000 },
  { id: 'pts_3500',  label: '3,500 Points',  points: 3500, cents: 2500 },
  { id: 'pts_10000', label: '10,000 Points', points: 10000, cents: 5000, best: true },
];

// ── GET /leaderboard — monthly referral leaderboard ─────────────────────────
router.get('/leaderboard', async (req, res) => {
  try {
    const [leaders, { getUserReferralStats, getUserMonthlyRank }] = await Promise.all([
      getMonthlyLeaderboard(25),
      Promise.resolve(require('../db/referrals')),
    ]);

    const currentUserId = req.session?.userId;
    let userStats = null;
    let userMonthlyRank = null; // real rank even if outside top 25

    if (currentUserId) {
      const [stats, rank] = await Promise.all([
        getUserReferralStats(currentUserId).catch(() => null),
        getUserMonthlyRank(currentUserId).catch(() => null),
      ]);
      userStats = stats;
      userMonthlyRank = rank;
    }

    res.render('pages/leaderboard', {
      leaders,
      userStats,
      userMonthlyRank,
      userEmail: req.session?.userEmail || null,
      getOrdinal: (n) => {
        const s = ['th','st','nd','rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
      },
    });
  } catch (err) {
    console.error('[referrals/leaderboard]', err);
    res.status(500).send('Failed to load leaderboard. Please try again later.');
  }
});

// ── GET /dashboard/referrals — user's referral dashboard ───────────────────
router.get('/dashboard/referrals', async (req, res) => {
  if (!req.session?.userId) return res.redirect('/login');

  try {
    const userStats = await getUserReferralStats(req.session.userId).catch(() => null);

    // Recent referrals for this user (last 10)
    const recent = await pool.query(
      `SELECT r.created_at, r.status, r.flagged,
              au.username, au.display_name, au.avatar_url
       FROM referrals r
       INNER JOIN auth_users au ON au.id = r.referred_user_id
       WHERE r.referrer_id = $1
       ORDER BY r.created_at DESC
       LIMIT 10`,
      [req.session.userId]
    );

    // Current point balance
    const balanceRow = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as balance FROM point_transactions WHERE user_id = $1`,
      [req.session.userId]
    ).catch(() => ({ rows: [{ balance: 0 }] }));

    // Transaction history (last 10)
    const txns = await pool.query(
      `SELECT amount, type, description, created_at
       FROM point_transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [req.session.userId]
    ).catch(() => ({ rows: [] }));

    res.render('pages/dashboard/referrals', {
      stats: userStats,
      recentReferrals: recent.rows,
      pointBalance: parseInt(balanceRow.rows[0].balance, 10),
      pointPacks: POINT_PACKS,
      pointTransactions: txns.rows,
      pointsPurchased: req.query.points_purchased === '1',
      purchaseCanceled: req.query.canceled === '1',
      userEmail: req.session.userEmail,
      getOrdinal: (n) => {
        const s = ['th','st','nd','rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
      },
    });
  } catch (err) {
    console.error('[referrals/dashboard]', err);
    res.status(500).send('Failed to load referral stats. Please try again later.');
  }
});

module.exports = router;