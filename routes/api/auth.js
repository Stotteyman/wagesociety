// routes/api/auth.js — Session read/destroy helpers only.
// Owns: GET /api/auth/me (session user), POST /api/auth/logout.
// Does NOT own: Supabase magic-link flow (routes/auth.js), credential-based login.
const express = require('express');
const router = express.Router();
const { getProfileByEmail } = require('../../db/profiles');
const { getMemberAccess } = require('../../db/orgAccess');

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.json({ user: null });
    const profile = await getProfileByEmail(email);
    const access = await getMemberAccess(email);
    res.json({
      user: profile ? { email, username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url, bio: profile.bio } : { email },
      access,
    });
  } catch (err) {
    console.error('[/api/auth/me]', err);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

module.exports = router;
