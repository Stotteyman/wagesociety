// db/admin-referrals.js — Admin referral attribution queries.
// Owns: admin_referral_attributions table reads/writes, point reversal logging.
// Does NOT own: organic referral tracking (referrals table), referral code generation (lib/referral-codes.js).
const { pool } = require('./index');

const REFERRER_POINTS = 100;
const REFEREE_POINTS = 200;

/**
 * Check if a referee already has a manual attribution.
 */
async function getAttributionByReferee(refereeId) {
  const { rows } = await pool.query(
    `SELECT ara.*,
            au_admin.email          AS admin_email,
            au_admin.display_name   AS admin_name,
            au_ref.display_name     AS referrer_name,
            au_ref.email            AS referrer_email,
            au_referee.display_name AS referee_name,
            au_referee.email        AS referee_email
     FROM admin_referral_attributions ara
     JOIN auth_users au_admin   ON au_admin.id   = ara.attributed_by_admin_id
     JOIN auth_users au_ref     ON au_ref.id     = ara.referrer_id
     JOIN auth_users au_referee ON au_referee.id = ara.referee_id
     WHERE ara.referee_id = $1`,
    [refereeId]
  );
  return rows[0] || null;
}

/**
 * Look up a user by their auth_users.id (UUID).
 */
async function getUserById(userId) {
  const { rows } = await pool.query(
    `SELECT id, email, display_name, avatar_url FROM auth_users WHERE id = $1`,
    [userId]
  );
  return rows[0] || null;
}

/**
 * Search users by display name or email (for autocomplete).
 */
async function searchUsers(query) {
  const { rows } = await pool.query(
    `SELECT id, display_name, email, avatar_url
     FROM auth_users
     WHERE display_name ILIKE $1 OR email ILIKE $1
     ORDER BY display_name
     LIMIT 10`,
    [`%${query}%`]
  );
  return rows;
}

/**
 * Look up a referrer by their referral code (auth_users.referral_code).
 */
async function getReferrerByCode(code) {
  const { rows } = await pool.query(
    `SELECT id, email, display_name, avatar_url, referral_code
     FROM auth_users
     WHERE UPPER(referral_code) = UPPER($1)
     LIMIT 1`,
    [code]
  );
  return rows[0] || null;
}

/**
 * Create a manual attribution. Awards points to both referrer and referee.
 * @param {Object} params
 * @param {string} params.refereeId - UUID of the referred user
 * @param {string} params.referrerId - UUID of the referrer
 * @param {string} params.referralCodeUsed - the code string (auth_users.referral_code)
 * @param {string} params.adminId - UUID of the admin performing the attribution
 */
async function createAttribution({ refereeId, referrerId, referralCodeUsed, adminId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO admin_referral_attributions
         (referee_id, referrer_id, referral_code_used, attributed_by_admin_id)
       VALUES ($1, $2, $3, $4)`,
      [refereeId, referrerId, referralCodeUsed, adminId]
    );

    // Award referrer: +100 points
    await client.query(
      `UPDATE auth_users SET referral_points = referral_points + $1 WHERE id = $2`,
      [REFERRER_POINTS, referrerId]
    );
    await client.query(
      `INSERT INTO point_transactions (user_id, amount, type, description)
       VALUES ($1, $2, $3, $4)`,
      [referrerId, REFERRER_POINTS, 'manual_referral_attribution', 'Manual referral attribution by admin']
    );

    // Award referee: +200 points
    await client.query(
      `UPDATE auth_users SET referral_points = referral_points + $1 WHERE id = $2`,
      [REFEREE_POINTS, refereeId]
    );
    await client.query(
      `INSERT INTO point_transactions (user_id, amount, type, description)
       VALUES ($1, $2, $3, $4)`,
      [refereeId, REFEREE_POINTS, 'manual_referral_attribution', 'Joined via manual referral attribution by admin']
    );

    await client.query('COMMIT');
    return { refereeId, referrerId, points_credited: { referrer: REFERRER_POINTS, referee: REFEREE_POINTS } };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Delete an attribution (for reversals). Subtracts previously credited points.
 */
async function deleteAttribution(attrId, adminId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT referee_id, referrer_id FROM admin_referral_attributions WHERE id = $1`,
      [attrId]
    );
    if (!rows[0]) throw new Error('Attribution not found');

    const { referee_id, referrer_id } = rows[0];

    // Log reversal
    await client.query(
      `INSERT INTO admin_referral_reversals
         (attribution_id, reversed_by_admin_id, referrer_id, referee_id, points_referrer, points_referee)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [attrId, adminId, referrer_id, referee_id, REFERRER_POINTS, REFEREE_POINTS]
    );

    // Reverse referrer points
    await client.query(
      `UPDATE auth_users SET referral_points = referral_points - $1 WHERE id = $2`,
      [REFERRER_POINTS, referrer_id]
    );
    await client.query(
      `INSERT INTO point_transactions (user_id, amount, type, description)
       VALUES ($1, $2, $3, $4)`,
      [referrer_id, -REFERRER_POINTS, 'referral_reversed', 'Manual referral attribution reversed by admin']
    );

    // Reverse referee points
    await client.query(
      `UPDATE auth_users SET referral_points = referral_points - $1 WHERE id = $2`,
      [REFEREE_POINTS, referee_id]
    );
    await client.query(
      `INSERT INTO point_transactions (user_id, amount, type, description)
       VALUES ($1, $2, $3, $4)`,
      [referee_id, -REFEREE_POINTS, 'referral_reversed', 'Manual referral attribution reversed by admin']
    );

    await client.query(
      `DELETE FROM admin_referral_attributions WHERE id = $1`,
      [attrId]
    );

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Paginated attribution history.
 */
async function getAttributionHistory({ page = 1, pageSize = 20, search = '' }) {
  const offset = (page - 1) * pageSize;
  const searchPattern = search ? `%${search}%` : null;

  let whereClause = '';
  let countParams = [];
  let listParams = [pageSize, offset];

  if (searchPattern) {
    whereClause = `WHERE
      au_referee.display_name ILIKE $1 OR
      au_ref.display_name     ILIKE $1 OR
      au_admin.display_name   ILIKE $1
    `;
    countParams = [searchPattern];
    listParams  = [searchPattern, pageSize, offset];
  }

  const [countResult, rows] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total
       FROM admin_referral_attributions ara
       JOIN auth_users au_referee ON au_referee.id = ara.referee_id
       JOIN auth_users au_ref     ON au_ref.id     = ara.referrer_id
       JOIN auth_users au_admin   ON au_admin.id   = ara.attributed_by_admin_id
       ${whereClause}`,
      countParams
    ),
    pool.query(
      `SELECT
         ara.id,
         ara.created_at,
         ara.referral_code_used,
         ara.referee_id,
         ara.referrer_id,
         au_referee.display_name AS referee_name,
         au_referee.email         AS referee_email,
         au_ref.display_name     AS referrer_name,
         au_ref.email             AS referrer_email,
         au_admin.display_name   AS admin_name,
         au_admin.email           AS admin_email
       FROM admin_referral_attributions ara
       JOIN auth_users au_referee ON au_referee.id = ara.referee_id
       JOIN auth_users au_ref     ON au_ref.id     = ara.referrer_id
       JOIN auth_users au_admin   ON au_admin.id   = ara.attributed_by_admin_id
       ${whereClause}
       ORDER BY ara.created_at DESC
       LIMIT $2 OFFSET $3`,
      listParams
    ),
  ]);

  return {
    rows,
    total: countResult.rows[0]?.total || 0,
    page,
    pageSize,
  };
}

/**
 * Overview stats for the admin referrals dashboard.
 */
async function getReferralOverview() {
  const [totalRows, organicRows, manualRows] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS cnt FROM admin_referral_attributions`),
    pool.query(`SELECT COUNT(*)::int AS cnt FROM referrals`),
    pool.query(`SELECT COUNT(*)::int AS cnt FROM admin_referral_attributions`),
  ]);

  const totalReferrals = totalRows.rows[0]?.cnt || 0;
  const organicReferrals = organicRows.rows[0]?.cnt || 0;

  // Top 5 referrers by manual attribution count
  const topReferrers = await pool.query(
    `SELECT
       u.id, u.display_name, u.email, u.avatar_url,
       COUNT(ara.id)::int AS attribution_count
     FROM auth_users u
     JOIN admin_referral_attributions ara ON ara.referrer_id = u.id
     GROUP BY u.id
     ORDER BY attribution_count DESC
     LIMIT 5`
  );

  return {
    totalManualAttributions: totalReferrals,
    organicReferrals,
    topReferrers: topReferrers.rows,
  };
}

module.exports = {
  getAttributionByReferee,
  getUserById,
  searchUsers,
  getReferrerByCode,
  createAttribution,
  deleteAttribution,
  getAttributionHistory,
  getReferralOverview,
  REFERRER_POINTS,
  REFEREE_POINTS,
};