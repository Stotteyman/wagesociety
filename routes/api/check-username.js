// routes/api/check-username.js — Check username availability.
const express = require('express');
const router = express.Router();
const { pool } = require('../../db/index');

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;

router.get('/', async (req, res) => {
  try {
    const { username, currentEmail } = req.query;
    if (!username) return res.status(400).json({ error: 'username required' });

    const trimmed = username.trim();
    if (!USERNAME_REGEX.test(trimmed)) {
      return res.json({ available: false, reason: '3–20 characters. Letters, numbers, underscores, hyphens only.' });
    }

    // Check existing usernames
    const result = await pool.query(
      `SELECT email FROM member_profiles WHERE username = $1`,
      [trimmed]
    );

    if (result.rows.length === 0) {
      return res.json({ available: true });
    }

    // Allow if it's the same user updating their own username
    if (currentEmail && result.rows[0].email === currentEmail) {
      return res.json({ available: true });
    }

    return res.json({ available: false, reason: 'Username is already taken.' });
  } catch (err) {
    console.error('[/api/check-username]', err);
    res.status(500).json({ error: 'Could not verify username right now.' });
  }
});

module.exports = router;