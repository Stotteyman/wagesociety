// routes/api/live.js — Livestream and autoclipper API endpoints.
const express = require('express');
const router = express.Router();
const { getPublicStreams } = require('../../db/livestreams');
const { getJobs, createJob, updateJobStatus } = require('../../db/autoclipper');
const { getMemberAccess } = require('../../db/orgAccess');

// GET /api/live/streams — public stream list + auth flags
router.get('/streams', async (req, res) => {
  try {
    const streams = await getPublicStreams();
    const email = req.session?.userEmail;
    let canManage = false;
    let canUseAutoclipper = false;
    if (email) {
      const access = await getMemberAccess(email);
      const allowed = new Set(['superadmin','admin','manager','staff','helper','user']);
      canManage = allowed.has(access.role) && access.role !== 'banned';
      canUseAutoclipper = canManage;
    }
    res.json({ streams, canManage, canUseAutoclipper });
  } catch (err) {
    console.error('[/api/live/streams]', err);
    res.status(500).json({ error: 'Failed to load streams' });
  }
});

// GET /api/live/clips
router.get('/clips', async (req, res) => {
  try {
    const jobs = await getJobs();
    res.json({ jobs });
  } catch (err) {
    console.error('[/api/live/clips GET]', err);
    res.status(500).json({ error: 'Failed to load clip jobs' });
  }
});

// POST /api/live/clips — trigger clip job
router.post('/clips', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Authentication required' });
    const { commandText, autoPost, autoCaption, platforms, clipWindowMinutes } = req.body;
    const job = await createJob({
      command: commandText || '!clip',
      source: 'manual',
      requested_by: email,
      clip_window_minutes: clipWindowMinutes || 5,
      auto_post: autoPost !== false,
      auto_caption: autoCaption !== false,
      platforms: platforms || [],
    });
    res.json({ job });
  } catch (err) {
    console.error('[/api/live/clips POST]', err);
    res.status(500).json({ error: 'Failed to create clip job' });
  }
});

// PUT /api/live/clips — update job status (managers only)
router.put('/clips', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Authentication required' });
    const access = await getMemberAccess(email);
    const allowed = new Set(['superadmin','admin','manager']);
    if (!allowed.has(access.role)) return res.status(403).json({ error: 'Forbidden' });
    const { id, status } = req.body;
    if (!id || !status) return res.status(400).json({ error: 'id and status required' });
    const job = await updateJobStatus(id, status);
    res.json({ job });
  } catch (err) {
    console.error('[/api/live/clips PUT]', err);
    res.status(500).json({ error: 'Failed to update clip job' });
  }
});

module.exports = router;