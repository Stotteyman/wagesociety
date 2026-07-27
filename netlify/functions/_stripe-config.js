// netlify/functions/_stripe-config.js — shared helper (NOT an endpoint).
//
// This file used to hold hardcoded buy.stripe.com Payment Link URLs copied from
// the legacy Express app (lib/stripe-config.js, where they are still named
// POLSIA_DONATION_* — the giveaway). Those links belong to acct_1TaNvdRSi3U4FW38,
// a Polsia-era Stripe account this project has no key for, so every payment
// through them settled into someone else's account, carried someone else's logo,
// and fired webhooks our endpoint never saw.
//
// They are gone. Everything now creates a Checkout Session on W.A.G.E.'s own
// account at request time (see checkout.js and video-checkout.js). Do not
// reintroduce a static payment link unless it was created on acct_1TMaxXCrLaBewrts.
const APP_URL = process.env.APP_URL || 'https://wagesociety.com';

function inferBillingCycle(stripePriceId) {
  if (!stripePriceId) return 'monthly';
  const id = stripePriceId.toLowerCase();
  if (id.includes('annual') || id.includes('yearly') || id.includes('_yr')) return 'annual';
  return 'monthly';
}

/**
 * Fallback tier lookup by amount, for events that arrive without metadata.
 * Annual is ten months, so each tier has two recognised amounts.
 * Kept in step with wagesociety.membership_plans.
 */
const TIER_AMOUNTS = {
  999: 'creator',    9990: 'creator',
  2499: 'pro',       24990: 'pro',
  4999: 'elite',     49990: 'elite',
  9999: 'unlimited', 99990: 'unlimited',
};

function inferTierFromAmount(amountCents) {
  return TIER_AMOUNTS[amountCents] || null;
}

function inferTierFromPriceId(priceId) {
  if (!priceId) return null;
  const id = priceId.toLowerCase();
  if (id.includes('creator')) return 'creator';
  if (id.includes('pro') && !id.includes('elite')) return 'pro';
  if (id.includes('elite')) return 'elite';
  if (id.includes('unlimited')) return 'unlimited';
  return null;
}

module.exports = {
  APP_URL,
  inferBillingCycle,
  inferTierFromAmount,
  inferTierFromPriceId,
};
