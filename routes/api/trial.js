// routes/api/trial.js — Trial-related user actions.
// POST /api/trial/dismiss — mark that the user has dismissed the trial upgrade prompt.
// POST /api/trial/cancel — cancel active trial subscription via Stripe.
const express = require('express');
const router = express.Router();
const { pool } = require('../../db/index');

router.post('/dismiss', async (req, res) => {
  if (!req.session?.userEmail) return res.status(401).json({ error: 'Not logged in' });
  await pool.query(
    `UPDATE auth_users SET trial_prompt_dismissed_at = NOW() WHERE email = $1 AND trial_prompt_dismissed_at IS NULL`,
    [req.session.userEmail.toLowerCase()]
  ).catch(err => console.error('[api/trial/dismiss] error:', err.message));
  res.json({ ok: true });
});

router.post('/cancel', async (req, res) => {
  if (!req.session?.userEmail) return res.status(401).json({ error: 'Not logged in' });

  const { getUserMembership, cancelMembership } = require('../../db/memberships');
  const membership = await getUserMembership(req.session.userEmail).catch(() => null);

  if (!membership || membership.status !== 'trialing') {
    return res.status(400).json({ error: 'No active trial to cancel' });
  }

  // Mark as canceled locally; webhook fires if Stripe subscription is cancelled.
  // User can also contact support to cancel directly in Stripe.
  await cancelMembership(req.session.userEmail, membership.plan_slug).catch(err => {
    console.error('[api/trial/cancel] cancelMembership error:', err.message);
  });

  res.json({ ok: true, redirectUrl: '/settings?canceled=1' });
});

module.exports = router;