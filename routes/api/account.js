// routes/api/account.js — Self-service account deletion.
// Owns: POST /api/account/delete (deletion) + GET /api/account/points (point balance).
// Does NOT own: auth middleware is applied at the router level.
const express = require('express');
const router = express.Router();
const { getUserByEmail, getUserById } = require('../../db/users');
const { getProfileByEmail } = require('../../db/profiles');
const { deleteAccount, getPointBalance } = require('../../db/account-deletion');

// ── Rate limiter (in-memory, keyed by IP) ────────────────────────────────────
const ipRequestCounts = new Map(); // ip -> [{ timestamp }]
const DELETION_RATE_LIMIT = 3; // max 3 attempts per IP per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip) {
  const now = Date.now();
  const requests = ipRequestCounts.get(ip) || [];
  const recent = requests.filter(t => now - t < RATE_WINDOW_MS);
  ipRequestCounts.set(ip, recent);
  if (recent.length >= DELETION_RATE_LIMIT) {
    return false;
  }
  recent.push(now);
  ipRequestCounts.set(ip, recent);
  return true;
}

// ── GET /api/account/points — used by the settings page to show point balance ──
router.get('/points', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Not authenticated' });
    const user = await getUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'User not found' });
    const balance = await getPointBalance(user.id);
    res.json({ points: balance });
  } catch (err) {
    console.error('[/api/account/points]', err);
    res.status(500).json({ error: 'Failed to load points' });
  }
});

// ── POST /api/account/delete ────────────────────────────────────────────────
router.post('/delete', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Not authenticated' });

    // Rate limit
    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: 'Too many attempts. Please try again in an hour.' });
    }

    const user = await getUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'User not found' });

    // Perform deletion (transactional)
    await deleteAccount(user.id, email);

    // Destroy session
    req.session.destroy(() => {
      res.clearCookie('wage.sid');
      res.clearCookie('connect.sid');
      res.json({ success: true, message: 'Account deleted' });
    });
  } catch (err) {
    console.error('[/api/account/delete]', err);
    res.status(500).json({ error: 'Failed to delete account. Please try again.' });
  }
});

module.exports = router;