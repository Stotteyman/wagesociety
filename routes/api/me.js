// routes/api/me.js — User access and profile endpoints.
const express = require('express');
const router = express.Router();
const { getProfileByEmail, upsertProfile } = require('../../db/profiles');
const { getMemberAccess } = require('../../db/orgAccess');

// GET /api/me/access — role + permissions for current session
router.get('/access', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Not authenticated' });
    const access = await getMemberAccess(email);
    res.json({
      requester: { email, source: 'session-auth' },
      ...access,
    });
  } catch (err) {
    console.error('[/api/me/access]', err);
    res.status(500).json({ error: 'Failed to load access info' });
  }
});

// GET /api/me/profile — current user's profile
router.get('/profile', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Not authenticated' });
    const profile = await getProfileByEmail(email);
    res.json(profile || { email });
  } catch (err) {
    console.error('[/api/me/profile GET]', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// PUT /api/me/profile — update profile fields
router.put('/profile', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Not authenticated' });
    const { username, display_name, bio, avatar_url, skills } = req.body;
    const profile = await upsertProfile(email, { username, display_name, bio, avatar_url, skills });
    res.json(profile);
  } catch (err) {
    console.error('[/api/me/profile PUT]', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;