// routes/api/public-profile.js — Public creator profile lookup.
const express = require('express');
const router = express.Router();
const { getPublicProfileByUsername } = require('../../db/profiles');

router.get('/', async (req, res) => {
  try {
    const username = req.query.username;
    if (!username) return res.status(400).json({ error: 'username required' });
    const profile = await getPublicProfileByUsername(username);
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });
    res.json({ profile });
  } catch (err) {
    console.error('[/api/public-profile]', err);
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

module.exports = router;