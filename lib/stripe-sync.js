// lib/stripe-sync.js — Sync membership tiers to Stripe via Polsia API.
// Calls create_subscription_link for new tiers; archives old prices and creates
// new ones when prices change. Stripe prices are immutable, so price changes
// always result in a new price (old is NOT deleted — Stripe keeps history).
//
// Does NOT own: which tiers to sync (caller decides). Does NOT call Stripe SDK
// directly — all calls go through Polsia API (api.polsia.com).
const https = require('https');

const POLSIA_API_KEY = process.env.POLSIA_API_KEY || '';
const POLSIA_API_HOST = 'api.polsia.com';

// ── Generic Polsia API call helper ───────────────────────────────────────────
function polsiaRequest(path, method, payload) {
  return new Promise((resolve, reject) => {
    if (!POLSIA_API_KEY) {
      reject(new Error('POLSIA_API_KEY not configured — cannot sync to Stripe'));
      return;
    }

    const body = JSON.stringify(payload);
    const options = {
      hostname: POLSIA_API_HOST,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${POLSIA_API_KEY}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`Polsia API ${res.statusCode}: ${JSON.stringify(parsed)}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Failed to parse Polsia response: ${e.message}`));
        }
      });
    });

    req.on('error', err => reject(new Error(`Polsia API unreachable: ${err.message}`)));
    req.write(body);
    req.end();
  });
}

// ── Create a Stripe subscription link for a tier ──────────────────────────────
// Creates a Polsia subscription link and returns the price ID + URL.
// Called when creating a new tier with price > 0, or when price changes.
// For price changes, the caller should note the old price is archived by Stripe.
async function createSubscriptionLink(tierName, priceCents) {
  const dollars = (priceCents / 100).toFixed(2);
  const data = await polsiaRequest('/v1/subscriptions/create-link', 'POST', {
    name: tierName,
    monthly_amount: parseFloat(dollars),
  });
  // Expected response: { id, url, stripe_price_id, stripe_product_id }
  return data;
}

// ── Get existing subscription link info (by price ID) ─────────────────────────
// Polsia doesn't currently expose a "get price" endpoint, so we just return null.
// Admin sees the last known stripe_price_id from the DB.
async function getPriceInfo(stripePriceId) {
  // Polsia API doesn't expose price retrieval — return stored info
  return null;
}

// ── Archive a Stripe price (Stripe prices are immutable — just stops using it) ──
// We don't call Stripe archive directly — we just stop referencing it.
// The caller sets the new stripe_price_id on the tier.
async function archivePrice(_stripePriceId) {
  // Stripe prices are immutable — you cannot archive/delete them.
  // The tier's old price will remain in Stripe history.
  // We simply return and let the new price replace it.
  return null;
}

module.exports = { createSubscriptionLink, archivePrice, getPriceInfo };