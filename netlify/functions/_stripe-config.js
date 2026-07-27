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

const isLocal = (u) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test((u || '').replace(/\/$/, ''));

/**
 * Where Stripe should send the buyer back to.
 *
 * APP_URL is stale in local envs (it still says :3000, the old Express port),
 * which sent everyone to a dead port after checkout. In development only, the
 * request's own origin wins, so whatever port the dev server is on is correct.
 *
 * The request origin is honoured ONLY when it is localhost AND APP_URL is itself
 * a localhost URL. Trusting an arbitrary Origin header in production would let
 * someone hand Stripe a return address pointing at a site they control.
 */
function returnBase(event) {
  if (!isLocal(APP_URL)) return APP_URL.replace(/\/$/, '');
  const headers = (event && event.headers) || {};
  const origin = headers.origin || headers.Origin;
  if (origin && isLocal(origin)) return origin.replace(/\/$/, '');
  return APP_URL.replace(/\/$/, '');
}

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
  returnBase,
  inferBillingCycle,
  inferTierFromAmount,
  inferTierFromPriceId,
};
