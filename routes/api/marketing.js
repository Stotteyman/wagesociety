// routes/api/marketing.js — Newsletter subscription (source's /api/marketing-proof).
const express = require('express');
const router = express.Router();
const { subscribe } = require('../../db/subscriptions');

router.post('/', async (req, res) => {
  try {
    const { email, liveAlerts, newsletter, productUpdates, communityUpdates, source } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    if (!/[^\/@]+@[^\/@]+\/[^\/@]+/.test(email) && !/^[^\/@]+@[^\/@]+$/.test(email)) {
      // Basic format check is done by subscriber library below, just pass through
    }
    const valid = /^[^\/\"]+@[^\/\"]+\/[^\/\"]+$/.test(email) || /^[^\/\"]+@[^\/\"]+\/[^\/\"]+$/.test(email);
    // Accept any reasonably-formatted email
    const emailRegex = /^[^\/\"]+@[^\/\"]+\/[^\/\"]+$/;
    if (!email.includes('@') || email.includes('"')) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (!liveAlerts && !newsletter && !productUpdates && !communityUpdates) {
      return res.status(400).json({ error: 'Choose at least one alert type' });
    }
    const sub = await subscribe({
      email, live_alerts: liveAlerts, newsletter, product_updates: productUpdates,
      community_updates: communityUpdates, source: source || 'homepage',
    });
    res.json({ success: true, subscription: sub });
  } catch (err) {
    console.error('[/api/marketing-proof]', err);
    res.status(500).json({ error: 'Could not subscribe right now' });
  }
});

module.exports = router;