// db/livestreams.js — Livestream CRUD.
const { pool } = require('./index');

async function getAllStreams() {
  const result = await pool.query(
    `SELECT id, email, platform, stream_key, stream_url, title, display_name,
            avatar_url, status, viewer_count, follower_count, account_created_at,
            created_at, updated_at
     FROM member_livestreams
     ORDER BY created_at DESC`
  );
  return result.rows;
}

async function getStreamsByEmail(email) {
  const result = await pool.query(
    'SELECT * FROM member_livestreams WHERE email = $1 ORDER BY created_at DESC',
    [email]
  );
  return result.rows;
}

async function upsertStream(email, data) {
  const { platform, stream_key, stream_url, title, display_name, avatar_url, status } = data;
  const result = await pool.query(
    `INSERT INTO member_livestreams (email, platform, stream_key, stream_url, title, display_name, avatar_url, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (email, platform) DO UPDATE SET
       stream_key=$3, stream_url=$4, title=COALESCE($5, member_livestreams.title),
       display_name=COALESCE($6, member_livestreams.display_name),
       avatar_url=COALESCE($7, member_livestreams.avatar_url),
       status=COALESCE($8, member_livestreams.status),
       updated_at=NOW()
     RETURNING *`,
    [email, platform, stream_key, stream_url, title, display_name, avatar_url, status || 'offline']
  );
  return result.rows[0];
}

async function deleteStream(email, platform) {
  await pool.query(
    'DELETE FROM member_livestreams WHERE email = $1 AND platform = $2',
    [email, platform]
  );
}

module.exports = { getAllStreams, getStreamsByEmail, upsertStream, deleteStream };