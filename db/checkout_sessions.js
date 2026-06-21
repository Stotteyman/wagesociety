// db/checkout_sessions.js — Stripe Checkout session → user mapping for membership activation.
// Before redirecting to Stripe, we record the pending session so the webhook can look up
// the user by session_id and activate their membership.
const { pool } = require('./index');

// Create a pending checkout session record before redirecting to Stripe.
// We don't know the Stripe session_id yet (Stripe creates it after the user lands
// on the payment page). The webhook fills session_id when checkout.session.completed fires.
async function createPendingSession({ userId, userEmail, planSlug, billingCycle, stripeLinkUrl }) {
  const result = await pool.query(
    `INSERT INTO checkout_sessions (user_id, user_email, plan_slug, billing_cycle, stripe_link_url)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at`,
    [userId, userEmail.toLowerCase(), planSlug, billingCycle, stripeLinkUrl]
  );
  return result.rows[0];
}

// Update session_id after Stripe redirect — look up by stripe_link_url, set session_id.
// Note: we pass stripeLinkUrl as a filter but Stripe doesn't give us the session_id upfront
// (Stripe creates it after the user lands on the payment page). For now, we rely on the
// webhook to set session_id from the event. This fn exists for future session-tracker flows.
async function updateSessionId(stripeLinkUrl, stripeSessionId) {
  await pool.query(
    `UPDATE checkout_sessions
     SET session_id = $2, expires_at = NOW() + INTERVAL '2 hours'
     WHERE stripe_link_url = $1
       AND activated_at IS NULL
       AND session_id IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [stripeLinkUrl, stripeSessionId]
  );
}

// Webhook: look up a checkout session by Stripe session_id.
// Returns the pending session record (user_email, plan_slug, billing_cycle) if found.
async function getBySessionId(stripeSessionId) {
  const result = await pool.query(
    `SELECT * FROM checkout_sessions
     WHERE session_id = $1
       AND activated_at IS NULL
     LIMIT 1`,
    [stripeSessionId]
  );
  return result.rows[0] || null;
}

// Webhook (primary path for payment links): look up by stripe_link_url (base URL, no query params).
// We record the clean link URL before redirecting; Stripe passes it back in session metadata.
async function getByLinkUrl(stripeLinkUrl) {
  const result = await pool.query(
    `SELECT * FROM checkout_sessions
     WHERE stripe_link_url = $1
       AND activated_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [stripeLinkUrl]
  );
  return result.rows[0] || null;
}

// Webhook: look up the most recent pending session by user email.
// Used as primary lookup when client_reference_id is set on payment link.
async function getByEmail(userEmail) {
  const result = await pool.query(
    `SELECT * FROM checkout_sessions
     WHERE user_email = $1
       AND activated_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [userEmail.toLowerCase()]
  );
  return result.rows[0] || null;
}

// Webhook: mark a session as activated
async function markActivated(stripeSessionId) {
  await pool.query(
    `UPDATE checkout_sessions SET activated_at = NOW()
     WHERE session_id = $1 AND activated_at IS NULL`,
    [stripeSessionId]
  );
}

// Record or update a points checkout session (keyed by Stripe session_id).
// Upserts so this works whether the record was written before or after the webhook fires.
async function upsertPointsSession(stripeSessionId, userEmail, metadata) {
  await pool.query(
    `INSERT INTO checkout_sessions (session_id, user_email, plan_slug, metadata, expires_at)
     VALUES ($1, $2, 'points', $3, NOW() + INTERVAL '2 hours')
     ON CONFLICT (session_id) DO UPDATE SET
       user_email = $2, plan_slug = 'points', metadata = $3`,
    [stripeSessionId, userEmail.toLowerCase(), JSON.stringify(metadata || {})]
  );
}

// Clean up stale pending sessions (older than 24 hours, never activated)
async function cleanupStaleSessions() {
  const result = await pool.query(
    `DELETE FROM checkout_sessions
     WHERE activated_at IS NULL
       AND expires_at < NOW()
     RETURNING id`
  );
  return result.rowCount;
}

module.exports = {
  createPendingSession,
  updateSessionId,
  getBySessionId,
  getByLinkUrl,
  getByEmail,
  markActivated,
  cleanupStaleSessions,
  upsertPointsSession,
};