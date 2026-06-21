// db/memberships.js — Paid tier membership queries.
// Memberships are paid plans from membership_plans (FREE/CREATOR/PRO).
// Stored in user_memberships. Roles are separate (see db/orgAccess.js).
const { pool } = require('./index');

const TIER_ORDER = { free: 0, creator: 1, pro: 2, elite: 3, unlimited: 4 };

// Get the active membership for a user (highest tier)
async function getUserMembership(email) {
  const result = await pool.query(
    `SELECT um.*, mp.name, mp.display_price, mp.slug, mp.features
     FROM user_memberships um
     JOIN membership_plans mp ON mp.slug = um.plan_slug
     WHERE um.email = $1 AND um.status IN ('active','trialing')
     ORDER BY mp.sort_order DESC
     LIMIT 1`,
    [email.toLowerCase()]
  );
  return result.rows[0] || null;
}

// Get all memberships for a user
async function getAllUserMemberships(email) {
  const result = await pool.query(
    `SELECT um.*, mp.name, mp.display_price, mp.slug, mp.features
     FROM user_memberships um
     JOIN membership_plans mp ON mp.slug = um.plan_slug
     WHERE um.email = $1
     ORDER BY mp.sort_order DESC`,
    [email.toLowerCase()]
  );
  return result.rows;
}

// Upsert a membership from Stripe webhook data (including trial fields)
async function upsertMembership({ email, planSlug, stripeCustomerId, stripeSubscriptionId, stripePriceId, periodStart, periodEnd, status, billingCycle = 'monthly', trialStartedAt = null, trialEndsAt = null }) {
  await pool.query(
    `INSERT INTO user_memberships
       (email, plan_slug, stripe_customer_id, stripe_subscription_id, stripe_price_id,
        current_period_start, current_period_end, status, billing_cycle,
        trial_started_at, trial_ends_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (email, plan_slug) DO UPDATE SET
       stripe_customer_id     = COALESCE(EXCLUDED.stripe_customer_id, user_memberships.stripe_customer_id),
       stripe_subscription_id = EXCLUDED.stripe_subscription_id,
       stripe_price_id        = COALESCE(EXCLUDED.stripe_price_id, user_memberships.stripe_price_id),
       current_period_start   = EXCLUDED.current_period_start,
       current_period_end     = EXCLUDED.current_period_end,
       status                 = EXCLUDED.status,
       billing_cycle          = EXCLUDED.billing_cycle,
       trial_started_at       = COALESCE(EXCLUDED.trial_started_at, user_memberships.trial_started_at),
       trial_ends_at          = COALESCE(EXCLUDED.trial_ends_at, user_memberships.trial_ends_at),
       updated_at             = NOW()`,
    [email.toLowerCase(), planSlug, stripeCustomerId, stripeSubscriptionId, stripePriceId, periodStart, periodEnd, status || 'active', billingCycle, trialStartedAt, trialEndsAt]
  );
}

// Cancel a membership (mark as canceled, remove Discord roles via webhook)
async function cancelMembership(email, planSlug) {
  await pool.query(
    `UPDATE user_memberships SET status = 'canceled', cancel_at_period_end = TRUE WHERE email = $1 AND plan_slug = $2`,
    [email.toLowerCase(), planSlug]
  );
}

// Downgrade user to FREE (called on trial cancellation or subscription deletion)
async function downgradeToFree(email) {
  await pool.query(
    `UPDATE user_memberships SET status = 'canceled' WHERE email = $1 AND status IN ('active','trialing')`,
    [email.toLowerCase()]
  );
}

// Check if user has at least a given tier (or higher)
function hasTier(userMembership, requiredTier) {
  if (!userMembership) return requiredTier === 'free';
  return (TIER_ORDER[userMembership.plan_slug] || 0) >= (TIER_ORDER[requiredTier] || 0);
}

module.exports = {
  getUserMembership, getAllUserMemberships, upsertMembership,
  cancelMembership, downgradeToFree, hasTier,
  TIER_ORDER,
};