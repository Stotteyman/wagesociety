// routes/api/chatbot.js — Autoclipper webhook endpoint.
const express = require('express');
const router = express.Router();
const { pool } = require('../../db/index');

const AUTOCLIP_SECRET = process.env.AUTOCLIP_SECRET || '';

// POST /api/chatbot — receive !clip command from Discord/chat
router.post('/', async (req, res) => {
  try {
    const secret = req.headers['x-autoclipper-secret'];
    if (AUTOCLIP_SECRET && secret !== AUTOCLIP_SECRET) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const {
      command,
      source = 'chat',
      requestedBy,
      autoPost = true,
      autoCaption = true,
      platforms = ['x', 'kick', 'instagram'],
      clipWindowMinutes = 5,
      streamPlatform,
      streamKey,
      caption = '',
    } = req.body;

    const result = await pool.query(
      `INSERT INTO autoclipper_jobs
       (command, source, requested_by, auto_post, auto_caption, platforms, clip_window_minutes, stream_platform, stream_key, caption, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'queued')
       RETURNING *`,
      [command, source, requestedBy, autoPost, autoCaption, platforms, clipWindowMinutes, streamPlatform, streamKey, caption]
    );

    res.json({ job: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create clip job' });
  }
});

module.exports = router;