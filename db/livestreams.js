// db/livestreams.js — Livestream CRUD keyed to auth_users.id.
// Owns: livestreams table (oauth-connected streaming channels).
// Does NOT own: member_livestreams (legacy email-keyed table).
const { pool } = require('./index');

// ── Read helpers ───────────────────────────────────────────────────────────

// All streams for the public /streams page, split into live + recent.
// Joins through auth_users because member_profiles is email-keyed (no user_id column).
async function getPublicStreams() {
  const result = await pool.query(
    `SELECT
       ls.*,
       mp.display_name  AS creator_name,
       mp.avatar_url     AS creator_avatar,
       mp.username       AS creator_username
     FROM livestreams ls
     JOIN auth_users au ON au.id = ls.user_id
     JOIN member_profiles mp ON mp.email = au.email
     ORDER BY ls.viewer_count DESC NULLS LAST`
  );
  return result.rows;
}

// Streams for a specific user (by auth_users.id).
async function getStreamsByUserId(userId) {
  const result = await pool.query(
    `SELECT * FROM livestreams WHERE user_id = $1 ORDER BY is_primary DESC, created_at DESC`,
    [userId]
  );
  return result.rows;
}

// Streams for a creator by username (joins via member_profiles → auth_users).
async function getStreamsByUsername(username) {
  const result = await pool.query(
    `SELECT
       ls.*,
       mp.display_name  AS creator_name,
       mp.avatar_url     AS creator_avatar
     FROM livestreams ls
     JOIN auth_users au ON au.id = ls.user_id
     JOIN member_profiles mp ON mp.email = au.email
     WHERE mp.username = $1
     ORDER BY ls.is_primary DESC, ls.created_at DESC`,
    [username]
  );
  return result.rows;
}

// Single stream by id, with creator info.
async function getStreamById(id) {
  const result = await pool.query(
    `SELECT
       ls.*,
       mp.display_name  AS creator_name,
       mp.avatar_url     AS creator_avatar,
       mp.username       AS creator_username
     FROM livestreams ls
     JOIN auth_users au ON au.id = ls.user_id
     JOIN member_profiles mp ON mp.email = au.email
     WHERE ls.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

// ── Write helpers ───────────────────────────────────────────────────────────

// Upsert a stream row from an OAuth callback (Kick / Twitch / Google connect).
async function upsertStreamByUserId(userId, data) {
  const {
    platform,
    platformChannelId,
    channelName,
    streamTitle,
    streamThumbnail,
    streamUrl,
    status = 'offline',
    isPrimary = false,
  } = data;

  const result = await pool.query(
    `INSERT INTO livestreams
       (user_id, platform, platform_channel_id, channel_name,
        stream_title, stream_thumbnail, stream_url, status, is_primary,
        last_checked_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
     ON CONFLICT (user_id, platform, platform_channel_id) DO UPDATE SET
       channel_name    = COALESCE($4,  livestreams.channel_name),
       stream_title    = COALESCE($5,  livestreams.stream_title),
       stream_thumbnail= COALESCE($6,  livestreams.stream_thumbnail),
       stream_url      = COALESCE($7,  livestreams.stream_url),
       status          = COALESCE($8,  livestreams.status),
       is_primary      = COALESCE($9,  livestreams.is_primary),
       last_checked_at = now()
     RETURNING *`,
    [userId, platform, platformChannelId, channelName, streamTitle,
     streamThumbnail, streamUrl, status, isPrimary]
  );
  return result.rows[0];
}

// Update stream status (used by background sync job, future work).
async function updateStreamStatus(id, { status, viewerCount, startedAt, endedAt }) {
  const result = await pool.query(
    `UPDATE livestreams SET
       status       = COALESCE($2, status),
       viewer_count = COALESCE($3, viewer_count),
       started_at   = COALESCE($4, started_at),
       ended_at     = COALESCE($5, ended_at),
       last_checked_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, status, viewerCount, startedAt, endedAt]
  );
  return result.rows[0];
}

// ── 5-minute in-memory cache (shared across calls) ──────────────────────────
const _viewerCache = { data: null, ts: 0 };
const _TTL_MS = 5 * 60 * 1000;

async function _fetchLiveViewerCount() {
  try {
    const result = await pool.query(
      `SELECT COALESCE(SUM(viewer_count), 0)::bigint AS total
       FROM livestreams
       WHERE status = 'live'`
    );
    return Number(result.rows[0]?.total || 0);
  } catch (err) {
    console.error('[livestreams] getLiveViewerCount error:', err.message);
    return 0;
  }
}

/** Total viewers across all live streams. Cached 5 minutes. */
async function getLiveViewerCount() {
  if (_viewerCache.data !== null && Date.now() - _viewerCache.ts < _TTL_MS) {
    return _viewerCache.data;
  }
  const total = await _fetchLiveViewerCount();
  _viewerCache.data = total;
  _viewerCache.ts = Date.now();
  return total;
}

module.exports = {
  getPublicStreams,
  getStreamsByUserId,
  getStreamsByUsername,
  getStreamById,
  upsertStreamByUserId,
  updateStreamStatus,
  getLiveViewerCount,
};