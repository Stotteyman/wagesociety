// db/referrals.js — Referral stats + transaction queries.
// Owns: referrals table reads, point_transactions reads.
// Does NOT own: referral code generation (lib/referral-codes.js), auth_users writes.
const { pool } = require('./index');

/** Get referral stats for a user by auth_users.id. */
async function getReferralStats(userId) {
  const [totalResult, verifiedResult, monthlyRankResult, pointsResult] = await Promise.all([
    pool.query(`SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1`, [userId]),
    pool.query(`SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1 AND status IN ('verified', 'rewarded')`, [userId]),
    pool.query(`SELECT COUNT(*) + 1 as rank FROM auth_users WHERE total_referrals > (SELECT COALESCE(total_referrals, 0) FROM auth_users WHERE id = $1)`, [userId]),
    pool.query(`SELECT COALESCE(SUM(amount), 0) as points FROM point_transactions WHERE user_id = $1`, [userId]),
  ]);

  return {
    totalReferrals: parseInt(totalResult.rows[0].count, 10),
    verifiedReferrals: parseInt(verifiedResult.rows[0].count, 10),
    monthlyRank: parseInt(monthlyRankResult.rows[0].rank, 10),
    pointsBalance: parseInt(pointsResult.rows[0].points, 10),
  };
}

/** Get the referrer info if this user was referred by someone. */
async function getReferredByInfo(userId) {
  const result = await pool.query(
    `SELECT u.id, u.display_name, u.referral_code
     FROM auth_users u
     WHERE u.id = (SELECT referred_by FROM auth_users WHERE id = $1)
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

/** Get the referrer username from auth_users.referred_by for a given user id. */
async function getReferrerUsername(userId) {
  const result = await pool.query(
    `SELECT a.display_name
     FROM auth_users u
     JOIN auth_users a ON a.id = u.referred_by
     WHERE u.id = $1
     LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.display_name || null;
}

/** Get recent point transactions for a user (last 20, ordered by created_at DESC). */
async function getRecentTransactions(userId, limit = 20) {
  const result = await pool.query(
    `SELECT amount, type, description, created_at
     FROM point_transactions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

/** Get recent referral signups for a user (last 20). */
async function getRecentReferrals(userId, limit = 20) {
  const result = await pool.query(
    `SELECT r.status, r.created_at, a.display_name, a.email
     FROM referrals r
     JOIN auth_users a ON a.id = r.referred_user_id
     WHERE r.referrer_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

module.exports = {
  getReferralStats,
  getReferredByInfo,
  getReferrerUsername,
  getRecentTransactions,
  getRecentReferrals,
  // ── Leaderboard functions ────────────────────────────────────────────────

  /**
   * Get top N referrers for the current month.
   * Excludes flagged entries from counts.
   */
  getMonthlyLeaderboard: async (limit = 25) => {
    const result = await pool.query(
      `SELECT
         u.id, u.email, u.display_name, u.avatar_url,
         u.referral_tier, u.total_referrals,
         COALESCE(mp.username, SPLIT_PART(u.email, '@', 1)) AS username,
         COUNT(r.id)::int AS monthly_referrals
       FROM auth_users u
       INNER JOIN referrals r ON r.referrer_id = u.id
       LEFT JOIN member_profiles mp ON mp.email = u.email
       WHERE r.created_at >= date_trunc('month', NOW())
         AND r.status IN ('verified', 'rewarded')
         AND r.flagged = false
       GROUP BY u.id, mp.username
       ORDER BY monthly_referrals DESC, u.total_referrals DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  },

  /**
   * Get current user's monthly rank (NULL if not in top 25).
   */
  getUserMonthlyRank: async (userId) => {
    const result = await pool.query(
      `WITH monthly AS (
         SELECT u.id, COUNT(r.id)::int AS cnt,
                ROW_NUMBER() OVER (ORDER BY COUNT(r.id) DESC, u.total_referrals DESC) AS rank
         FROM auth_users u
         INNER JOIN referrals r ON r.referrer_id = u.id
         WHERE r.created_at >= date_trunc('month', NOW())
           AND r.status IN ('verified', 'rewarded')
           AND r.flagged = false
         GROUP BY u.id
       )
       SELECT rank FROM monthly WHERE id = $1`,
      [userId]
    );
    return result.rows[0]?.rank || null;
  },

  /**
   * Get user's referral stats for the dashboard.
   */
  getUserReferralStats: async (userId) => {
    const [userRow, monthlyCnt] = await Promise.all([
      pool.query(`SELECT referral_points, referral_tier, total_referrals, referral_code FROM auth_users WHERE id = $1`, [userId]),
      pool.query(
        `SELECT COUNT(*)::int AS cnt FROM referrals
         WHERE referrer_id = $1
           AND created_at >= date_trunc('month', NOW())
           AND status IN ('verified', 'rewarded')
           AND flagged = false`,
        [userId]
      ),
    ]);
    if (!userRow.rows.length) return null;
    const s = userRow.rows[0];
    const rank = await pool.query(
      `WITH monthly AS (
         SELECT u.id, ROW_NUMBER() OVER (ORDER BY COUNT(r.id) DESC) AS rn
         FROM auth_users u
         INNER JOIN referrals r ON r.referrer_id = u.id
         WHERE r.created_at >= date_trunc('month', NOW())
           AND r.status IN ('verified', 'rewarded') AND r.flagged = false
         GROUP BY u.id
       )
       SELECT rn FROM monthly WHERE id = $1`,
      [userId]
    );
    return {
      points: s.referral_points,
      tier: s.referral_tier,
      totalReferrals: s.total_referrals,
      code: s.referral_code,
      monthlyReferrals: monthlyCnt.rows[0]?.cnt || 0,
      monthlyRank: rank.rows[0]?.rn || null,
    };
  },

  // ── Write functions ──────────────────────────────────────────────────────

  /**
   * Award points to a user and log the transaction.
   * @param {string|number} userId
   * @param {number} amount - positive for earned, negative for spent
   * @param {string} type - e.g. 'referral_signup', 'referral_verified', 'joined_referral'
   * @param {string} description
   */
  awardPoints: async (userId, amount, type, description) => {
    await pool.query(
      `UPDATE auth_users SET referral_points = referral_points + $1 WHERE id = $2`,
      [amount, userId]
    );
    await pool.query(
      `INSERT INTO point_transactions (user_id, amount, type, description)
       VALUES ($1, $2, $3, $4)`,
      [userId, amount, type, description]
    );
  },

  /**
   * Recalculate referral_tier for a user based on total_referrals count.
   * Thresholds: 10+ silver, 50+ gold, 250+ diamond, else bronze.
   */
  // ── TODO: Delayed reward escalation hooks ─────────────────────────────────────
  // Hook 1 — Paid membership bonus: call awardReferralPurchaseBonus(userId)
  //           when a referred user upgrades to a paid membership.
  //           Add to: lib/stripe-config.js or routes/api/webhooks.js after
  //           handling subscription.created / customer.subscription.created events.
  //           Reward: +500 points to referrer, type: 'referral_purchase'.
  //
  // Hook 2 — 30-day retention bonus: cron job calls checkReferralRetention(userId)
  //           after referred user account is 30+ days old and still active (not banned).
  //           Reward: +300 points to referrer, type: 'referral_retained'.
  //           Suggested schedule: "0 8 * * *" running scripts/check-referral-retention.js
  //           — neither the job nor that script exists yet. See docs/CRON_SCHEDULES.md.
  // ───────────────────────────────────────────────────────────────────────────

  recalcReferralTier: async (userId) => {
    const { calculateReferralTier } = require('../lib/referral-codes');
    const result = await pool.query(`SELECT total_referrals FROM auth_users WHERE id = $1`, [userId]);
    if (!result.rows[0]) return;
    const tier = calculateReferralTier(result.rows[0].total_referrals);
    await pool.query(`UPDATE auth_users SET referral_tier = $1 WHERE id = $2`, [tier, userId]);
  },

  /**
   * Look up a referrer's display_name by their referral code.
   */
  getReferrerByCode: async (referralCode) => {
    const result = await pool.query(
      `SELECT display_name FROM auth_users WHERE referral_code = $1 LIMIT 1`,
      [referralCode]
    );
    return result.rows[0]?.display_name || null;
  },

  /**
   * Process a verified email: award referrer + new user points, update referral status.
   * Called from auth-custom.js after magic link verification.
   */
  processVerifiedReferral: async (userId) => {
    const pending = await pool.query(
      `SELECT * FROM referrals WHERE referred_user_id = $1 AND status = 'pending' LIMIT 1`,
      [userId]
    );
    if (!pending.rows[0]) return;
    const ref = pending.rows[0];
    // Award referrer: 150 pts (100 signup already given, +50 for verification)
    await pool.query(
      `UPDATE auth_users SET referral_points = referral_points + 150, total_referrals = total_referrals + 1 WHERE id = $1`,
      [ref.referrer_id]
    );
    await pool.query(
      `INSERT INTO point_transactions (user_id, amount, type, description) VALUES ($1, $2, $3, $4)`,
      [ref.referrer_id, 150, 'referral_verified', 'Referral verified their email']
    );
    // Award new user: 200 pts
    await pool.query(
      `UPDATE auth_users SET referral_points = referral_points + 200 WHERE id = $1`,
      [userId]
    );
    await pool.query(
      `INSERT INTO point_transactions (user_id, amount, type, description) VALUES ($1, $2, $3, $4)`,
      [userId, 200, 'joined_referral', 'Joined through referral link']
    );
    // Update referral status
    await pool.query(
      `UPDATE referrals SET status = 'verified', reward_given = true WHERE id = $1`,
      [ref.id]
    );
    // Recalculate referrer tier
    const { calculateReferralTier } = require('../lib/referral-codes');
    const tierResult = await pool.query(`SELECT total_referrals FROM auth_users WHERE id = $1`, [ref.referrer_id]);
    if (tierResult.rows[0]) {
      const tier = calculateReferralTier(tierResult.rows[0].total_referrals);
      await pool.query(`UPDATE auth_users SET referral_tier = $1 WHERE id = $2`, [tier, ref.referrer_id]);
    }
  },
};