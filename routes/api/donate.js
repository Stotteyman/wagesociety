// routes/api/donate.js — Donations via Polsia built-in Stripe.
// All monetary flows go through Polsia's Stripe — NO direct Stripe API calls.
// Quick amounts: pre-created Polsia Stripe payment links (direct redirect).
// Custom amounts: call Polsia Stripe API to create a dynamic payment link, then redirect.
const express = require('express');
const router = express.Router();
const https = require('https');
const { createDonation, getDonationTotal, getRecentDonations } = require('../../db/donations');
const { DONATION_LINKS, APP_URL } = require('../../lib/stripe-config');

// POLSIA_API_KEY is set by Polsia platform for all payment API calls.
const POLSIA_API_KEY = process.env.POLSIA_API_KEY || '';

// ── GET /api/donate/quick-amounts ─────────────────────────────────────────────
// Return the pre-created Polsia Stripe payment link URLs for fixed amounts.
// These are safe to expose client-side — they redirect to Stripe directly.
router.get('/quick-amounts', (_req, res) => {
  res.json({
    10:  DONATION_LINKS.donation_10,
    25:  DONATION_LINKS.donation_25,
    50:  DONATION_LINKS.donation_50,
    100: DONATION_LINKS.donation_100,
  });
});

// ── POST /api/donate/create-link ──────────────────────────────────────────────
// For custom amounts, create a dynamic Polsia Stripe payment link then redirect.
// We store a pending record in DB; the webhook updates it to completed.
router.post('/create-link', async (req, res) => {
  const { amount, name, message } = req.body;

  if (!amount || isNaN(amount) || Number(amount) < 1) {
    return res.status(400).json({ error: 'Minimum donation is $1.' });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  const amountCents = Math.round(Number(amount) * 100);
  const donorName    = name.trim();
  const donorMessage = (message || '').trim();
  const successUrl   = `${APP_URL}/donate/success?session_id=CHECKOUT_SESSION_ID`;
  const cancelUrl    = `${APP_URL}/donate?canceled=1`;

  // Store pending donation in DB (webhook updates it to completed on payment).
  let dbRecord = null;
  try {
    dbRecord = await createDonation({
      amountCents,
      donorName,
      donorMessage,
      stripeCheckoutSessionId: `pending:${Date.now()}`,
    });
  } catch (err) {
    console.error('[donate/create-link] DB write failed:', err.message);
    // Non-fatal — Stripe still processes the payment.
  }

  // Call Polsia Stripe API to create a dynamic payment link.
  // Revenue auto-appears in Polsia Business section.
  const polsiaPayload = JSON.stringify({
    name: `Donation - ${donorName}`,
    description: donorMessage || 'W.A.G.E. Society donation',
    amount: amountCents,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      donor_name: donorName,
      type: 'donation',
      db_record_id: dbRecord?.id || null,
    },
  });

  const doRedirect = (paymentUrl) => {
    res.json({ url: paymentUrl });
  };

  const doError = (errMsg) => {
    res.status(500).json({ error: errMsg });
  };

  if (!POLSIA_API_KEY) {
    // Fallback: use the $10 base link with params — better than failing outright.
    console.warn('[donate] POLSIA_API_KEY not set — using base donation link fallback');
    const baseLink = DONATION_LINKS.donation_10;
    const params = new URLSearchParams({
      'success_url': successUrl,
      'cancel_url': cancelUrl,
      'name': donorName,
    });
    doRedirect(`${baseLink}&${params.toString()}`);
    return;
  }

  const options = {
    hostname: 'api.polsia.com',
    path: '/v1/payment_links',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${POLSIA_API_KEY}`,
    },
  };

  const payReq = https.request(options, (payRes) => {
    let body = '';
    payRes.on('data', chunk => { body += chunk; });
    payRes.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (payRes.statusCode >= 400) {
          console.error('[donate] Polsia API error:', data);
          doError('Failed to create payment link. Please try again.');
          return;
        }
        const paymentUrl = data?.url;
        if (!paymentUrl) {
          doError('No payment URL returned from Polsia.');
          return;
        }
        doRedirect(paymentUrl);
      } catch (e) {
        console.error('[donate] Polsia response parse error:', e.message);
        doError('Invalid response from payment system.');
      }
    });
  });

  payReq.on('error', (err) => {
    console.error('[donate] Polsia API call failed:', err.message);
    doError('Payment system unreachable. Please try again.');
  });

  payReq.write(polisiaPayload);
  payReq.end();
});

// ── GET /api/donate/total ──────────────────────────────────────────────────────
// Returns { total_cents, goal_cents, count, percentage } for the progress bar.
router.get('/total', async (_req, res) => {
  try {
    const totals = await getDonationTotal();
    res.json(totals);
  } catch (err) {
    console.error('[donations/total]', err);
    res.status(500).json({ error: 'Failed to load donation totals' });
  }
});

// ── GET /api/donate/recent ─────────────────────────────────────────────────────
// Returns the last 10 completed donations for the donor wall.
router.get('/recent', async (_req, res) => {
  try {
    const donations = await getRecentDonations(10);
    res.json({ donations });
  } catch (err) {
    console.error('[donations/recent]', err);
    res.status(500).json({ error: 'Failed to load recent donations' });
  }
});

module.exports = router;