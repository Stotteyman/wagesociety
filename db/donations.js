// db/donations.js — Donation records for the WAGE Society fund.
// Only handles one-time donations via Stripe Checkout.
// No custom credential auth.
const { pool } = require('./index');

const GOAL_CENTS = 100000; // $1,000

/** Insert a new pending donation record. */
async function createDonation({ amountCents, donorName, donorMessage, stripeCheckoutSessionId }) {
  const result = await pool.query(
    `INSERT INTO donations (amount_cents, donor_name, donor_message, stripe_checkout_session_id, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING *`,
    [amountCents, donorName, donorMessage || null, stripeCheckoutSessionId]
  );
  return result.rows[0];
}

/** Mark a donation as completed by its Stripe Checkout session ID. */
async function completeDonation(stripeCheckoutSessionId) {
  const result = await pool.query(
    `UPDATE donations
     SET status = 'completed'
     WHERE stripe_checkout_session_id = $1 AND status = 'pending'
     RETURNING *`,
    [stripeCheckoutSessionId]
  );
  return result.rows[0];
}

/** Get the donation totals (sum of completed donations, count, percentage toward goal). */
async function getDonationTotal() {
  const result = await pool.query(
    `SELECT
       COALESCE(SUM(amount_cents), 0)  AS total_cents,
       COUNT(*)                         AS count,
       LEAST(CAST(COALESCE(SUM(amount_cents), 0) AS numeric) / $1 * 100, 100)
                                          AS percentage
     FROM donations
     WHERE status = 'completed'`,
    [GOAL_CENTS]
  );
  const row = result.rows[0];
  return {
    total_cents:   Number(row.total_cents),
    goal_cents:    GOAL_CENTS,
    count:         Number(row.count),
    percentage:    Math.round(Number(row.percentage) * 10) / 10,
  };
}

/** Get the last N completed donations (newest first) for the donor wall. */
async function getRecentDonations(limit = 10) {
  const result = await pool.query(
    `SELECT donor_name, amount_cents, donor_message, created_at
     FROM donations
     WHERE status = 'completed'
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/** Get a single donation by its UUID (used on success page for DB-validated display). */
async function getDonationById(id) {
  const result = await pool.query(
    `SELECT * FROM donations WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/** Get a donation by its Stripe Checkout session ID (for success page DB validation). */
async function getDonationByStripeSession(stripeCheckoutSessionId) {
  const result = await pool.query(
    `SELECT * FROM donations WHERE stripe_checkout_session_id = $1 AND status = 'completed'`,
    [stripeCheckoutSessionId]
  );
  return result.rows[0] || null;
}

/**
 * Called by the Stripe webhook to finalize a donation.
 * Matches by exact session ID or pending: placeholder, updates amount from Stripe-confirmed value.
 */
async function completeDonationByWebhook(stripeSessionId, amountCents) {
  const result = await pool.query(
    `UPDATE donations
     SET status = 'completed',
         stripe_checkout_session_id = $1,
         amount_cents = COALESCE(NULLIF($2, 0), amount_cents)
     WHERE stripe_checkout_session_id LIKE 'pending:%'
        OR stripe_checkout_session_id = $1
     RETURNING id`,
    [stripeSessionId, amountCents]
  );
  return result.rows[0] || null;
}

module.exports = { createDonation, completeDonation, completeDonationByWebhook, getDonationTotal, getRecentDonations, getDonationById, getDonationByStripeSession, GOAL_CENTS };