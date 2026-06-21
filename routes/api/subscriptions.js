// routes/api/subscriptions.js — Subscription status and trial cancel.
// GET  /api/subscriptions/status   — return trial/subscription status for current user
// DELETE /api/subscriptions/trial   — cancel active trial, downgrade to FREE immediately
const express = require('express');
const router = express.Router();
const { pool } = require('../../db/index');
const { getUserMembership, downgradeToFree } = require('../../db/memberships');
const { getUserByEmail } = require('../../db/users');
const { syncAllGuildsForUser } = require('../../lib/discord-sync');

// GET /api/subscriptions/status
router.get('/status', async (req, res) => {
  if (!req.session?.userEmail) return res.status(401).json({ error: 'Not logged in' });

  const email = req.session.userEmail;
  const [membership, userRow] = await Promise.all([
    getUserMembership(email).catch(() => null),
    pool.query(`SELECT subscription_status, trial_started_at, trial_tier FROM auth_users WHERE email = $1 LIMIT 1`, [email]).catch(() => ({ rows: [] })),
  ]);

  let daysRemaining = null;
  if (membership?.status === 'trialing' && membership.trial_ends_at) {
    const ends = new Date(membership.trial_ends_at);
    daysRemaining = Math.max(0, Math.ceil((ends - Date.now()) / (1000 * 60 * 60 * 24)));
  }

  res.json({
    status: membership?.status || userRow.rows[0]?.subscription_status || 'none',
    tier: membership?.plan_slug || null,
    billingCycle: membership?.billing_cycle || null,
    trialDaysRemaining: daysRemaining,
    trialStartedAt: membership?.trial_started_at || userRow.rows[0]?.trial_started_at || null,
    trialTier: membership?.plan_slug || userRow.rows[0]?.trial_tier || null,
  });
});

// DELETE /api/subscriptions/trial — cancel trial, downgrade to FREE immediately
router.delete('/trial', async (req, res) => {
  if (!req.session?.userEmail) return res.status(401).json({ error: 'Not logged in' });

  const email = req.session.userEmail;
  const membership = await getUserMembership(email).catch(() => null);

  // Downgrade to FREE: cancel all active/trialing memberships
  await downgradeToFree(email).catch(err => console.error('[subscriptions/trial] downgradeToFree error:', err.message));

  // Clear trial fields on auth_users
  await pool.query(
    `UPDATE auth_users SET subscription_status = 'cancelled', trial_started_at = NULL, trial_tier = NULL WHERE email = $1`,
    [email.toLowerCase()]
  ).catch(err => console.error('[subscriptions/trial] auth_users update error:', err.message));

  const user = await getUserByEmail(email).catch(() => null);
  if (user?.id) {
    syncAllGuildsForUser(user.id).catch(err => console.log(`[subscriptions/trial] Discord sync error: ${err.message}`));
  }

  res.json({ ok: true, message: 'Trial canceled. You are now on the Free plan.' });
});

module.exports = router;