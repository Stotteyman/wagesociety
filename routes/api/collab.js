// routes/api/collab.js — Collaboration requests CRUD.
const express = require('express');
const router = express.Router({ mergeParams: true });
const { pool } = require('../../db/index');

function requireAuth(req, res, next) {
  if (!req.session?.userEmail) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// GET /api/collab — list open requests + own
router.get('/', requireAuth, async (req, res) => {
  try {
    const email = req.session.userEmail;
    const result = await pool.query(
      `SELECT * FROM collab_requests
       WHERE status = 'open' OR owner_email = $1
       ORDER BY created_at DESC LIMIT 50`,
      [email]
    );
    res.json({ requests: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load collab requests' });
  }
});

// POST /api/collab — create request
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
    const result = await pool.query(
      `INSERT INTO collab_requests (owner_email, title, description, status)
       VALUES ($1, $2, $3, 'open') RETURNING *`,
      [req.session.userEmail, title.trim(), description?.trim() || '']
    );
    res.json({ request: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create collab request' });
  }
});

// GET /api/collab/applicants — applicants for own requests
router.get('/applicants', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ca.*, cr.title as request_title
       FROM collab_applications ca
       JOIN collab_requests cr ON cr.id = ca.request_id
       WHERE cr.owner_email = $1
       ORDER BY ca.created_at DESC`,
      [req.session.userEmail]
    );
    res.json({ applicants: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load applicants' });
  }
});

// POST /api/collab/apply — apply to a request
router.post('/apply', requireAuth, async (req, res) => {
  try {
    const { requestId, message } = req.body;
    if (!requestId) return res.status(400).json({ error: 'requestId required' });
    const result = await pool.query(
      `INSERT INTO collab_applications (request_id, applicant_email, message)
       VALUES ($1, $2, $3) RETURNING *`,
      [requestId, req.session.userEmail, message?.trim() || '']
    );
    res.json({ application: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Already applied' });
    console.error(err);
    res.status(500).json({ error: 'Failed to apply' });
  }
});

// PUT /api/collab/applicants — update applicant status
router.put('/applicants', requireAuth, async (req, res) => {
  try {
    const { id, status } = req.body;
    const result = await pool.query(
      `UPDATE collab_applications
       SET status = $1
       WHERE id = $2
       AND request_id IN (SELECT id FROM collab_requests WHERE owner_email = $3)
       RETURNING *`,
      [status, id, req.session.userEmail]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Application not found' });
    res.json({ application: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update application' });
  }
});

module.exports = router;