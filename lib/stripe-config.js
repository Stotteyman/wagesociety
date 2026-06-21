// lib/stripe-config.js — Polsia-built Stripe payment/subscription links.
// All monetary flows go through Polsia's built-in Stripe (mcp__stripe__*) — NO direct Stripe API.
//
// ARCHITECTURE:
// - Subscription links → frontend redirects to Polsia Stripe, which forwards to
//   /checkout/success?session_id=cs_xxx with session metadata (tier, billing_cycle).
//   Before redirecting, we store tier+billing_cycle in session so the success page
//   can look it up without trusting URL params alone.
// - Webhook at /api/webhooks/stripe handles checkout.session.completed and activates
//   the membership in DB based on session metadata.
// - Revenue tracked automatically in Polsia Business section.
//
// SUBSCRIPTION LINKS (from Polsia Stripe MCP, 2026-05-30):
//   7-day trial links (all paid tiers, monthly + annual):
//   Creator monthly:  https://buy.stripe.com/dRm00lcxveyC5il3Fo6wE0d  (link id 105913)
//   Pro monthly:      https://buy.stripe.com/cNi14pgNLeyC8uxa3M6wE0e  (link id 105914)
//   ELITE monthly:    https://buy.stripe.com/6oUbJ3fJH8aebGJa3M6wE0f  (link id 105915)
//   UNLIMITED monthly:https://buy.stripe.com/9B66oJapnaim5ilb7Q6wE0g  (link id 105916)
//   Creator annual:   https://buy.stripe.com/4gM9AV0ON76a8ux0tc6wE0h  (link id 105917)
//   Pro annual:       https://buy.stripe.com/8x28wRapncqu6mpgsa6wE0i  (link id 105918)
//   ELITE annual:     https://buy.stripe.com/aFa6oJ8hfbmqh13ek26wE0j  (link id 105956)
//   UNLIMITED annual: https://buy.stripe.com/28EbJ3dBzaim4eh4Js6wE0k  (link id 105957)
//
// FIXED DONATION LINKS (from Polsia Stripe MCP, 2026-05-24):
//   $10: https://buy.stripe.com/dRmfZjcxv8aebGJek26wE03              (link id 94613)
//   $25: https://buy.stripe.com/7sYfZj2WVaimbGJ5Nw6wE04              (link id 94614)
//   $50: https://buy.stripe.com/3cI4gBfJH6263ad5Nw6wE05              (link id 94615)
//   $100: https://buy.stripe.com/4gMcN7btrgGKfWZb7Q6wE06             (link id 94616)

const APP_URL = process.env.APP_URL || 'https://wagesociety.com';

// ── Membership subscription links (7-day trial, payment info required upfront) ─
const SUBSCRIPTION_LINKS_MONTHLY = {
  creator:   process.env.POLSIA_TRIAL_CREATOR_MONTHLY_URL   || 'https://buy.stripe.com/dRm00lcxveyC5il3Fo6wE0d',
  pro:       process.env.POLSIA_TRIAL_PRO_MONTHLY_URL       || 'https://buy.stripe.com/cNi14pgNLeyC8uxa3M6wE0e',
  elite:     process.env.POLSIA_TRIAL_ELITE_MONTHLY_URL     || 'https://buy.stripe.com/6oUbJ3fJH8aebGJa3M6wE0f',
  unlimited: process.env.POLSIA_TRIAL_UNLIMITED_MONTHLY_URL || 'https://buy.stripe.com/9B66oJapnaim5ilb7Q6wE0g',
};

const SUBSCRIPTION_LINKS_ANNUAL = {
  creator:   process.env.POLSIA_TRIAL_CREATOR_ANNUAL_URL   || 'https://buy.stripe.com/4gM9AV0ON76a8ux0tc6wE0h',
  pro:       process.env.POLSIA_TRIAL_PRO_ANNUAL_URL       || 'https://buy.stripe.com/8x28wRapncqu6mpgsa6wE0i',
  elite:     process.env.POLSIA_TRIAL_ELITE_ANNUAL_URL     || 'https://buy.stripe.com/aFa6oJ8hfbmqh13ek26wE0j',
  unlimited: process.env.POLSIA_TRIAL_UNLIMITED_ANNUAL_URL || 'https://buy.stripe.com/28EbJ3dBzaim4eh4Js6wE0k',
};

// ── Fixed-amount donation payment links ─────────────────────────────────────
const DONATION_LINKS = {
  donation_10:  process.env.POLSIA_DONATION_10_URL  || 'https://buy.stripe.com/dRmfZjcxv8aebGJek26wE03',
  donation_25:  process.env.POLSIA_DONATION_25_URL  || 'https://buy.stripe.com/7sYfZj2WVaimbGJ5Nw6wE04',
  donation_50:  process.env.POLSIA_DONATION_50_URL  || 'https://buy.stripe.com/3cI4gBfJH6263ad5Nw6wE05',
  donation_100: process.env.POLSIA_DONATION_100_URL || 'https://buy.stripe.com/4gMcN7btrgGKfWZb7Q6wE06',
};

// ── Tier metadata stored in session before Stripe redirect ───────────────────
const SUBSCRIPTION_METADATA = {
  'https://buy.stripe.com/dRm00lcxveyC5il3Fo6wE0d': { tier: 'creator',   billing_cycle: 'monthly' },
  'https://buy.stripe.com/cNi14pgNLeyC8uxa3M6wE0e': { tier: 'pro',       billing_cycle: 'monthly' },
  'https://buy.stripe.com/6oUbJ3fJH8aebGJa3M6wE0f': { tier: 'elite',     billing_cycle: 'monthly' },
  'https://buy.stripe.com/9B66oJapnaim5ilb7Q6wE0g': { tier: 'unlimited', billing_cycle: 'monthly' },
  'https://buy.stripe.com/4gM9AV0ON76a8ux0tc6wE0h': { tier: 'creator',   billing_cycle: 'annual'  },
  'https://buy.stripe.com/8x28wRapncqu6mpgsa6wE0i': { tier: 'pro',       billing_cycle: 'annual'  },
  'https://buy.stripe.com/aFa6oJ8hfbmqh13ek26wE0j': { tier: 'elite',     billing_cycle: 'annual'  },
  'https://buy.stripe.com/28EbJ3dBzaim4eh4Js6wE0k': { tier: 'unlimited', billing_cycle: 'annual'  },
};

module.exports = {
  SUBSCRIPTION_LINKS_MONTHLY,
  SUBSCRIPTION_LINKS_ANNUAL,
  DONATION_LINKS,
  SUBSCRIPTION_METADATA,
  APP_URL,
};