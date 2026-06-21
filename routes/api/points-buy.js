// routes/api/points-buy.js — Buy points with real money via Polsia Stripe.
// All monetary flows go through Polsia's Stripe — NO direct Stripe API calls.
// Creates a dynamic payment link via Polsia API, redirects user to Stripe,
// then webhook fulfills the points credit on completion.
const express = require('express');
const router = express.Router();
const https   = require('https');
const { requireAuth } = require('../../lib/middleware');
const { getUserByEmail } = require('../../db/users');
const { pool } = require('../../db/index');
const { APP_URL } = require('../../lib/stripe-config');

// Point packs: label → cents → points
const POINT_PACKS = [
  { id: 'pts_500',   label: '500 Points',    points: 500,  cents: 500  },
  { id: 'pts_1200',  label: '1,200 Points',  points: 1200, cents: 1000 },
  { id: 'pts_3500',  label: '3,500 Points',  points: 3500, cents: 2500 },
  { id: 'pts_10000', label: '10,000 Points', points: 10000, cents: 5000, best: true },
];

const POLSIA_API_KEY = process.env.POLSIA_API_KEY || '';
const POLSIA_API_HOST = 'api.polsia.com';

// GET /api/points/packs — public, returns available packs
router.get('/packs', (_req, res) => {
  res.json({ packs: POINT_PACKS });
});

// POST /api/points/buy — create Polsia payment link and redirect to Stripe.
// Body: { packId: string }
router.post('/buy', requireAuth, async (req, res) => {
  const { packId } = req.body;
  const pack = POINT_PACKS.find(p => p.id === packId);
  if (!pack) return res.status(400).json({ error: 'Invalid point pack.' });

  const email = req.session.userEmail;
  const user  = await getUserByEmail(email);
  if (!user) return res.status(401).json({ error: 'User not found.' });

  const successUrl = `${APP_URL}/dashboard/referrals?points_purchased=1&pack=${pack.id}`;
  const cancelUrl  = `${APP_URL}/dashboard/referrals?canceled=1`;
  const metadata   = { type: 'points', packId, points: pack.points };

  // Store pending record before redirect — webhook resolves by client_reference_id = email
  await pool.query(
    `INSERT INTO checkout_sessions (user_id, user_email, plan_slug, billing_cycle, metadata)
     VALUES ($1, $2, 'points', $3, $4)
     ON CONFLICT DO NOTHING`,
    [user.id, email, pack.id, JSON.stringify(metadata)]
  ).catch(err => {
    console.warn('[points/buy] checkout_sessions insert failed (non-fatal):', err.message);
  });

  if (!POLSIA_API_KEY) {
    return res.status(503).json({ error: 'Payment system not configured.' });
  }

  const polsiaPayload = JSON.stringify({
    name: `${pack.label} — WAGE Society`,
    description: `Add ${pack.points.toLocaleString()} points to your WAGE Society account`,
    amount: pack.cents,
    success_url: successUrl,
    cancel_url:  cancelUrl,
    metadata: {
      ...metadata,
      client_reference_id: email, // webhook uses this to identify user
    },
  });

  const options = {
    hostname: POLSIA_API_HOST,
    path: '/v1/payment_links',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${POLSIA_API_KEY}`,
    },
  };

  const req_ = https.request(options, (apiRes) => {
    let body = '';
    apiRes.on('data', chunk => { body += chunk; });
    apiRes.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (apiRes.statusCode >= 400) {
          console.error('[points/buy] Polsia API error:', data);
          return res.status(500).json({ error: 'Failed to create payment link.' });
        }
        const paymentUrl = data?.url;
        if (!paymentUrl) return res.status(500).json({ error: 'No payment URL returned.' });
        // Append client_reference_id so Stripe passes email to webhook
        const separator = paymentUrl.includes('?') ? '&' : '?';
        res.json({ url: `${paymentUrl}${separator}client_reference_id=${encodeURIComponent(email)}` });
      } catch (e) {
        console.error('[points/buy] response parse error:', e.message);
        res.status(500).json({ error: 'Invalid response from payment system.' });
      }
    });
  });

  req_.on('error', err => {
    console.error('[points/buy] Polsia API call failed:', err.message);
    res.status(500).json({ error: 'Payment system unreachable.' });
  });

  req_.write(polisiaPayload);
  req_.end();
});

module.exports = router;