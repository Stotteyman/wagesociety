// routes/api/checkout.js — Membership checkout redirect.
// Records pending session in DB, stores tier+billing_cycle in session before
// redirecting to Stripe. Webhook activates membership; success page confirms.
const express = require('express');
const router = express.Router();
const { SUBSCRIPTION_LINKS_MONTHLY, SUBSCRIPTION_LINKS_ANNUAL } = require('../../lib/stripe-config');
const { createPendingSession } = require('../../db/checkout_sessions');
const { getTierBySlug } = require('../../db/membership_tiers');

router.post('/redirect', async (req, res) => {
  const { planSlug, cycle } = req.body;

  if (!planSlug || !cycle) {
    return res.status(400).json({ error: 'planSlug and cycle required' });
  }

  const userEmail = req.session?.userEmail;
  if (!userEmail) {
    return res.status(401).json({ error: 'Must be logged in to upgrade' });
  }

  // Validate plan slug against membership_tiers DB (source of truth)
  const tier = await getTierBySlug(planSlug).catch(() => null);
  if (!tier || tier.price_cents === 0) {
    return res.status(400).json({ error: `Invalid plan slug: ${planSlug}` });
  }

  // Annual links are env-overridable; fall back to monthly links if not set
  const links = cycle === 'annual' ? SUBSCRIPTION_LINKS_ANNUAL : SUBSCRIPTION_LINKS_MONTHLY;
  let url = links[planSlug];

  if (!url) {
    return res.status(400).json({ error: `No link found for ${planSlug} ${cycle}` });
  }

  // Append client_reference_id so Stripe passes the user's email to the webhook
  // via session.metadata.client_reference_id. This is how we identify the user
  // when payment links fire checkout.session.completed without user-facing auth.
  if (userEmail && !url.includes('client_reference_id')) {
    url += (url.includes('?') ? '&' : '?') + 'client_reference_id=' + encodeURIComponent(userEmail);
  }

  // Look up user UUID for FK reference in checkout_sessions
  const { getUserByEmail } = require('../../db/users');
  const user = await getUserByEmail(userEmail).catch(() => null);

  // Record pending session in DB so webhook can look up user by email/client_ref
  await createPendingSession({
    userId: user?.id || null,
    userEmail,
    planSlug,
    billingCycle: cycle,
    stripeLinkUrl: url.split('?')[0], // store clean URL without query params
  }).catch(err => {
    console.error('[checkout] Failed to record pending session:', err.message);
  });

  // Store metadata so success page can display confirmation and flag the success alert.
  // All subscription links now include 7-day trial — status will be set by webhook
  // based on subscription.current_period_start/trial end from Stripe.
  req.session.pendingCheckout = {
    tier: planSlug,
    billingCycle: cycle,
    link: url,
    timestamp: Date.now(),
  };
  req.session.checkoutSuccess = true;

  res.json({ redirectUrl: url });
});

module.exports = router;