// db/points-shop.js — Point shop queries: browse items, purchase, badges, admin.
const { pool } = require('./index');

// Derive badge slug from item name for 'badge' items.
// E.g. "VIP Badge" → "vip_badge", "Top Recruiter Role" → "top_recruiter_role".
function badgeSlug(name) {
  return name.toLowerCase().replace(/\b(and|of|the)\b/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/** All active shop items, ordered for display. */
async function getActiveShopItems() {
  const result = await pool.query(
    `SELECT id, name, description, point_cost, item_type, metadata, sort_order
     FROM shop_items
     WHERE active = true
     ORDER BY sort_order, id`
  );
  return result.rows;
}

/** All shop items (admin view, active + inactive). */
async function getAllShopItems() {
  const result = await pool.query(
    `SELECT id, name, description, point_cost, item_type, metadata, sort_order, active, created_at
     FROM shop_items
     ORDER BY sort_order, id`
  );
  return result.rows;
}

/** One item by ID (UUID string). */
async function getShopItem(id) {
  const result = await pool.query(
    `SELECT id, name, description, point_cost, item_type, metadata, active
     FROM shop_items WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/** Deduct points + record purchase. Returns { success, error }.
 *
 * Reward logic by item_type:
 *   badge        → append badge slug to auth_users.badges JSONB array
 *   role         → append role name to auth_users.badges JSONB array (TODO: integrate with org_roles system)
 *   membership_days / profile_frame / username_color / marketplace_credit / vip_access
 *                → deduct points + record purchase only (TODO: implement reward application)
 */
async function purchaseItem(userId, itemId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the user row so concurrent purchases can't race
    const userRow = await client.query(
      `SELECT id, referral_points, badges FROM auth_users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    if (!userRow.rows[0]) {
      await client.query('ROLLBACK');
      return { success: false, error: 'User not found' };
    }

    const itemRow = await client.query(
      `SELECT id, point_cost, item_type, name, active FROM shop_items WHERE id = $1`,
      [itemId]
    );
    if (!itemRow.rows[0]) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Item not found' };
    }

    const item = itemRow.rows[0];
    if (!item.active) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Item is no longer available' };
    }

    const currentPoints = userRow.rows[0].referral_points;
    if (currentPoints < item.point_cost) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Insufficient points' };
    }

    // Build badge update clause only for badge/role types
    const badgeUpdate = (item.item_type === 'badge' || item.item_type === 'role')
      ? `, badges = badges || $4::JSONB`
      : '';
    const badgeParam = (item.item_type === 'badge' || item.item_type === 'role')
      ? JSON.stringify(badgeSlug(item.name))
      : null;

    // Atomic deduction — WHERE clause is the race-condition guard
    const params = badgeParam
      ? [userId, item.point_cost, item.item_type, badgeParam]
      : [userId, item.point_cost];
    const deductSql = badgeParam
      ? `UPDATE auth_users
         SET referral_points = referral_points - $2
             ${badgeUpdate},
             updated_at = NOW()
         WHERE id = $1 AND referral_points >= $2
         RETURNING referral_points`
      : `UPDATE auth_users
         SET referral_points = referral_points - $2,
             updated_at = NOW()
         WHERE id = $1 AND referral_points >= $2
         RETURNING referral_points`;

    const deduct = await client.query(deductSql, params);

    if (!deduct.rows[0]) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Point deduction failed — retry' };
    }

    // Record the purchase with the cost at time of purchase (immutable historical record)
    await client.query(
      `INSERT INTO shop_purchases (user_id, item_id, point_cost) VALUES ($1, $2, $3)`,
      [userId, itemId, item.point_cost]
    );

    // Point transaction ledger entry (negative = spent)
    await client.query(
      `INSERT INTO point_transactions (user_id, amount, type, description)
       VALUES ($1, $2, 'shop_purchase', $3)`,
      [userId, -item.point_cost, `Purchased ${item.name}`]
    );

    await client.query('COMMIT');
    return { success: true, item };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** User's purchase history (most recent first).
 *  point_cost comes from shop_purchases.point_cost (stored at purchase time, immutable)
 *  rather than shop_items (which could be updated later, changing historical records). */
async function getUserPurchases(userId) {
  const result = await pool.query(
    `SELECT sp.id, sp.point_cost, sp.created_at,
            si.name AS item_name, si.item_type
     FROM shop_purchases sp
     JOIN shop_items si ON si.id = sp.item_id
     WHERE sp.user_id = $1
     ORDER BY sp.created_at DESC`,
    [userId]
  );
  return result.rows;
}

/** User's current badge list. */
async function getUserBadges(userId) {
  const result = await pool.query(
    `SELECT badges FROM auth_users WHERE id = $1`,
    [userId]
  );
  return (result.rows[0]?.badges) || [];
}

// Admin: create shop item (column 'active', not 'is_active')
async function createShopItem({ name, description, point_cost, item_type, metadata, sort_order, is_active }) {
  const result = await pool.query(
    `INSERT INTO shop_items (name, description, point_cost, item_type, metadata, sort_order, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [name, description || '', point_cost, item_type, metadata || null, sort_order || 0, is_active !== false]
  );
  return result.rows[0];
}

// Admin: update shop item (column 'active', not 'is_active')
async function updateShopItem(id, { name, description, point_cost, item_type, metadata, sort_order, is_active }) {
  const result = await pool.query(
    `UPDATE shop_items SET
       name       = COALESCE($2, name),
       description= COALESCE($3, description),
       point_cost = COALESCE($4, point_cost),
       item_type  = COALESCE($5, item_type),
       metadata   = COALESCE($6, metadata),
       sort_order = COALESCE($7, sort_order),
       active     = COALESCE($8, active),
       updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, name, description, point_cost, item_type, metadata, sort_order, is_active]
  );
  return result.rows[0] || null;
}

// Admin: delete shop item
async function deleteShopItem(id) {
  await pool.query('DELETE FROM shop_items WHERE id = $1', [id]);
}

module.exports = {
  getActiveShopItems,
  getAllShopItems,
  getShopItem,
  purchaseItem,
  getUserPurchases,
  getUserBadges,
  createShopItem,
  updateShopItem,
  deleteShopItem,
};