// db/membership_tiers.js — Membership tier queries + Stripe sync helpers.
// Owns: membership_tiers table CRUD.
// Does NOT own: Stripe API calls (delegated to lib/stripe-sync.js).
const { pool } = require('./index');

// ── List ──────────────────────────────────────────────────────────────────────
async function getAllTiers({ activeOnly = false } = {}) {
  const where = activeOnly ? 'WHERE is_active = true' : '';
  const result = await pool.query(
    `SELECT * FROM membership_tiers ${where} ORDER BY sort_order, created_at`
  );
  return result.rows;
}

async function getTierById(id) {
  const result = await pool.query('SELECT * FROM membership_tiers WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function getTierBySlug(slug) {
  const result = await pool.query('SELECT * FROM membership_tiers WHERE slug = $1', [slug]);
  return result.rows[0] || null;
}

// ── Subscriber counts ─────────────────────────────────────────────────────────
async function getSubscriberCount(tierId) {
  const result = await pool.query(
    `SELECT COUNT(*) FROM user_memberships
     WHERE plan_slug = (SELECT slug FROM membership_tiers WHERE id = $1)
       AND status IN ('active','trialing')`,
    [tierId]
  );
  return parseInt(result.rows[0].count, 10);
}

async function getAllSubscriberCounts() {
  // Count subscribers per tier directly from auth_users — the single source
  // of truth. tier is synced from user_memberships (see migration
  // 1751750000_sync_tier_from_membership.sql) and kept current by application
  // logic. No double-counting: auth_users.tier is the canonical field; orphaned
  // user_memberships rows (emails not in auth_users) are simply ignored.
  const result = await pool.query(
    `SELECT mt.id, mt.slug,
       (SELECT COUNT(*)::int FROM auth_users au WHERE au.tier = mt.slug) AS subscriber_count
     FROM membership_tiers mt`
  );
  return result.rows;
}

// ── Create ────────────────────────────────────────────────────────────────────
async function createTier({ name, slug, description, priceCents, features, sortOrder, stripePriceId, stripeProductId }) {
  const result = await pool.query(
    `INSERT INTO membership_tiers
       (name, slug, description, price_cents, features, sort_order, stripe_price_id, stripe_product_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      name,
      slug,
      description || '',
      priceCents || 0,
      JSON.stringify(features || []),
      sortOrder || 0,
      stripePriceId || null,
      stripeProductId || null,
    ]
  );
  return result.rows[0];
}

// ── Update ─────────────────────────────────────────────────────────────────────
async function updateTier(id, { name, slug, description, priceCents, features, sortOrder, isActive, stripePriceId, stripeProductId }) {
  const result = await pool.query(
    `UPDATE membership_tiers SET
       name            = COALESCE($1, name),
       slug            = COALESCE($2, slug),
       description     = COALESCE($3, description),
       price_cents     = COALESCE($4, price_cents),
       features        = COALESCE($5, features),
       sort_order      = COALESCE($6, sort_order),
       is_active       = COALESCE($7, is_active),
       stripe_price_id = COALESCE($8, stripe_price_id),
       stripe_product_id = COALESCE($9, stripe_product_id),
       updated_at      = NOW()
     WHERE id = $10
     RETURNING *`,
    [
      name,
      slug,
      description,
      priceCents,
      features ? JSON.stringify(features) : null,
      sortOrder,
      isActive,
      stripePriceId,
      stripeProductId,
      id,
    ]
  );
  return result.rows[0] || null;
}

// ── Delete ──────────────────────────────────────────────────────────────────────
async function deleteTier(id) {
  const result = await pool.query('DELETE FROM membership_tiers WHERE id = $1 RETURNING *', [id]);
  return result.rows[0] || null;
}

// ── Toggle active ─────────────────────────────────────────────────────────────
async function toggleTierActive(id) {
  const result = await pool.query(
    `UPDATE membership_tiers SET is_active = NOT is_active, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
}

module.exports = {
  getAllTiers,
  getTierById,
  getTierBySlug,
  getSubscriberCount,
  getAllSubscriberCounts,
  createTier,
  updateTier,
  deleteTier,
  toggleTierActive,
};