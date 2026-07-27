// netlify/functions/_stripe-config.js — shared helper (NOT an endpoint).
// Stripe Payment Links (7-day trial, all paid tiers). Same links as the live
// Express app (lib/stripe-config.js) — do not regenerate without updating both.
const APP_URL = process.env.APP_URL || 'https://wagesociety.com';

const SUBSCRIPTION_LINKS_MONTHLY = {
  creator:   process.env.STRIPE_TRIAL_CREATOR_MONTHLY_URL   || 'https://buy.stripe.com/dRm00lcxveyC5il3Fo6wE0d',
  pro:       process.env.STRIPE_TRIAL_PRO_MONTHLY_URL       || 'https://buy.stripe.com/cNi14pgNLeyC8uxa3M6wE0e',
  elite:     process.env.STRIPE_TRIAL_ELITE_MONTHLY_URL     || 'https://buy.stripe.com/6oUbJ3fJH8aebGJa3M6wE0f',
  unlimited: process.env.STRIPE_TRIAL_UNLIMITED_MONTHLY_URL || 'https://buy.stripe.com/9B66oJapnaim5ilb7Q6wE0g',
};

const SUBSCRIPTION_LINKS_ANNUAL = {
  creator:   process.env.STRIPE_TRIAL_CREATOR_ANNUAL_URL   || 'https://buy.stripe.com/4gM9AV0ON76a8ux0tc6wE0h',
  pro:       process.env.STRIPE_TRIAL_PRO_ANNUAL_URL       || 'https://buy.stripe.com/8x28wRapncqu6mpgsa6wE0i',
  elite:     process.env.STRIPE_TRIAL_ELITE_ANNUAL_URL     || 'https://buy.stripe.com/aFa6oJ8hfbmqh13ek26wE0j',
  unlimited: process.env.STRIPE_TRIAL_UNLIMITED_ANNUAL_URL || 'https://buy.stripe.com/28EbJ3dBzaim4eh4Js6wE0k',
};

const DONATION_LINKS = {
  donation_10:  process.env.STRIPE_DONATION_10_URL  || 'https://buy.stripe.com/dRmfZjcxv8aebGJek26wE03',
  donation_25:  process.env.STRIPE_DONATION_25_URL  || 'https://buy.stripe.com/7sYfZj2WVaimbGJ5Nw6wE04',
  donation_50:  process.env.STRIPE_DONATION_50_URL  || 'https://buy.stripe.com/3cI4gBfJH6263ad5Nw6wE05',
  donation_100: process.env.STRIPE_DONATION_100_URL || 'https://buy.stripe.com/4gMcN7btrgGKfWZb7Q6wE06',
};

function inferBillingCycle(stripePriceId) {
  if (!stripePriceId) return 'monthly';
  const id = stripePriceId.toLowerCase();
  if (id.includes('annual') || id.includes('yearly') || id.includes('_yr')) return 'annual';
  return 'monthly';
}

function inferTierFromAmount(amountCents) {
  if (amountCents === 2900 || amountCents === 29000) return 'creator';
  if (amountCents === 7900 || amountCents === 79000) return 'pro';
  if (amountCents === 19900 || amountCents === 199000) return 'elite';
  if (amountCents === 49900 || amountCents === 499000) return 'unlimited';
  return null;
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
  SUBSCRIPTION_LINKS_MONTHLY,
  SUBSCRIPTION_LINKS_ANNUAL,
  DONATION_LINKS,
  inferBillingCycle,
  inferTierFromAmount,
  inferTierFromPriceId,
};
