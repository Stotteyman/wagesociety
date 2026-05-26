// db/autoclipper.js — Autoclipper job queries.
const { pool } = require('./index');

async function getJobs() {
  const result = await pool.query(
    'SELECT * FROM autoclipper_jobs ORDER BY created_at DESC LIMIT 50'
  );
  return result.rows;
}

async function createJob(data) {
  const { command, source, requested_by, clip_window_minutes, stream_platform, stream_key,
          auto_post, auto_caption, platforms, caption } = data;
  const result = await pool.query(
    `INSERT INTO autoclipper_jobs (command, source, requested_by, clip_window_minutes,
       stream_platform, stream_key, auto_post, auto_caption, platforms, caption, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'queued')
     RETURNING *`,
    [command || '!clip', source || 'manual', requested_by, clip_window_minutes || 5,
     stream_platform, stream_key, auto_post !== false, auto_caption !== false,
     platforms || [], caption || '']
  );
  return result.rows[0];
}

async function updateJobStatus(id, status) {
  const result = await pool.query(
    `UPDATE autoclipper_jobs SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, status]
  );
  return result.rows[0];
}

module.exports = { getJobs, createJob, updateJobStatus };