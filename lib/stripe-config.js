// lib/stripe-config.js — Polsia-built Stripe payment/subscription links.
// All monetary flows go through Polsia's built-in Stripe (mcp__stripe__*) — NO direct Stripe API.
// Links pre-created via Polsia Stripe MCP. Update as needed (set env vars for production overrides).
//
// ARCHITECTURE:
// - Subscription links → direct frontend redirect (no backend call)
// - Fixed donation links → direct frontend redirect
// - Custom donation amount → POST /api/donate/create-link → Polsia Stripe MCP creates dynamic link
// - Revenue tracked automatically in Polsia Business section
//
// SUBSCRIPTION LINKS (from Polsia Stripe MCP, 2026-05-25):
//   Creator monthly ($29/mo): https://buy.stripe.com/4gMfZj7dbgGK6mpgsa6wE00  (link id 94610)
//   Pro monthly ($79/mo):     https://buy.stripe.com/7sY7sNdBz76a3ada3M6wE01  (link id 94611)
//   Creator annual ($290/yr): https://buy.stripe.com/7sYdRbeFDeyCbGJa3M6wE07  (link id 95683)
//   Pro annual ($790/yr):     https://buy.stripe.com/fZueVf7db4Y28uxgsa6wE08  (link id 95684)
//
// FIXED DONATION LINKS (from Polsia Stripe MCP, 2026-05-24):
//   $10: https://buy.stripe.com/dRmfZjcxv8aebGJek26wE03              (link id 94613)
//   $25: https://buy.stripe.com/7sYfZj2WVaimbGJ5Nw6wE04              (link id 94614)
//   $50: https://buy.stripe.com/3cI4gBfJH6263ad5Nw6wE05              (link id 94615)
//   $100: https://buy.stripe.com/4gMcN7btrgGKfWZb7Q6wE06             (link id 94616)

const APP_URL = process.env.APP_URL || 'https://ai.wagesociety.com';

// ── Membership subscription links ────────────────────────────────────────────
// Monthly
const SUBSCRIPTION_LINKS_MONTHLY = {
  creator: process.env.POLSIA_SUBSCRIPTION_CREATOR_MONTHLY_URL || 'https://buy.stripe.com/4gMfZj7dbgGK6mpgsa6wE00',
  pro:     process.env.POLSIA_SUBSCRIPTION_PRO_MONTHLY_URL     || 'https://buy.stripe.com/7sY7sNdBz76a3ada3M6wE01',
};

// Annual (10 months = 2 months free vs monthly)
const SUBSCRIPTION_LINKS_ANNUAL = {
  creator: process.env.POLSIA_SUBSCRIPTION_CREATOR_ANNUAL_URL || 'https://buy.stripe.com/7sYdRbeFDeyCbGJa3M6wE07',
  pro:     process.env.POLSIA_SUBSCRIPTION_PRO_ANNUAL_URL     || 'https://buy.stripe.com/fZueVf7db4Y28uxgsa6wE08',
};

// ── Fixed-amount donation payment links ─────────────────────────────────────
const DONATION_LINKS = {
  donation_10:  process.env.POLSIA_DONATION_10_URL  || 'https://buy.stripe.com/dRmfZjcxv8aebGJek26wE03',
  donation_25:  process.env.POLSIA_DONATION_25_URL  || 'https://buy.stripe.com/7sYfZj2WVaimbGJ5Nw6wE04',
  donation_50:  process.env.POLSIA_DONATION_50_URL  || 'https://buy.stripe.com/3cI4gBfJH6263ad5Nw6wE05',
  donation_100: process.env.POLSIA_DONATION_100_URL || 'https://buy.stripe.com/4gMcN7btrgGKfWZb7Q6wE06',
};

module.exports = {
  SUBSCRIPTION_LINKS_MONTHLY,
  SUBSCRIPTION_LINKS_ANNUAL,
  DONATION_LINKS,
  APP_URL,
};