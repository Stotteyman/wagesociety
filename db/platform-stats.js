// db/platform-stats.js — Aggregate platform stats for landing page.
// Does NOT own user auth or per-creator data (see db/profiles.js, db/livestreams.js).
const { pool } = require('./index');

// ── 5-minute in-memory cache ──────────────────────────────────────────────────
let _cache = { data: null, ts: 0 };
const _TTL_MS = 5 * 60 * 1000;

function _fromCache() {
  if (_cache.data && Date.now() - _cache.ts < _TTL_MS) return _cache.data;
  return null;
}

function _setCache(data) {
  _cache = { data, ts: Date.now() };
}

// ── Primary export: all homepage stats in one query ───────────────────────────
/**
 * Returns real-time homepage stats. Results cached for 5 minutes.
 * Shape:
 *   { total_earned_cents, creators_joined, live_streams_today,
 *     products_launched, community_members }
 */
async function getHomepageStats() {
  const cached = _fromCache();
  if (cached) return cached;

  try {
    const [earned, creators, liveToday, products, online] = await Promise.all([
      // 1. Total earned — streaming earnings (non-dev) + completed donations
      pool.query(`
        SELECT (
          COALESCE((
            SELECT SUM(ml.total_earned_cents)
            FROM member_livestreams ml
            INNER JOIN member_profiles mp ON mp.email = ml.email
            WHERE mp.role != 'banned'
              AND mp.is_dev_account = false
              AND mp.email NOT ILIKE '%@wagesociety.com'
              AND mp.email NOT ILIKE '%wagesocietydev%'
          ), 0) +
          COALESCE((
            SELECT SUM(amount_cents) FROM donations WHERE status = 'completed'
          ), 0)
        )::bigint AS total
      `).catch(() => ({ rows: [{ total: 0 }] })),

      // 2. Total creators — count of non-dev, non-banned auth_users
      pool.query(`
        SELECT COUNT(*)::int AS cnt FROM auth_users
        WHERE is_dev_account = false
          AND is_suspended = false
          AND email NOT ILIKE '%@wagesociety.com'
          AND email NOT ILIKE '%wagesocietydev%'
      `).catch(() => ({ rows: [{ cnt: 0 }] })),

      // 3. Live streams — currently live across both tables
      pool.query(`
        SELECT (
          COALESCE((SELECT COUNT(*) FROM member_livestreams WHERE status = 'live'), 0) +
          COALESCE((SELECT COUNT(*) FROM livestreams WHERE status = 'live'), 0)
        )::int AS cnt
      `).catch(() => ({ rows: [{ cnt: 0 }] })),

      // 4. Published products — active merch items
      pool.query(`
        SELECT COUNT(*)::int AS cnt FROM merch_items
        WHERE is_active = true
      `).catch(() => ({ rows: [{ cnt: 0 }] })),

      // 5. Community members online — active in last 15 minutes (last_seen_at)
      pool.query(`
        SELECT COUNT(*)::int AS cnt FROM auth_users
        WHERE last_seen_at > NOW() - INTERVAL '15 minutes'
          AND is_dev_account = false
          AND is_suspended = false
      `).catch(() => ({ rows: [{ cnt: 0 }] })),
    ]);

    const stats = {
      total_earned_cents:   Number(earned.rows[0]?.total    || 0),
      creators_joined:     Number(creators.rows[0]?.cnt    || 0),
      live_streams_today:  Number(liveToday.rows[0]?.cnt    || 0),
      products_launched:   Number(products.rows[0]?.cnt   || 0),
      community_members:   Number(online.rows[0]?.cnt     || 0),
    };

    _setCache(stats);
    return stats;
  } catch (err) {
    console.error('[platform-stats] getHomepageStats error:', err.message);
    return {
      total_earned_cents:  0,
      creators_joined:     0,
      live_streams_today:  0,
      products_launched:   0,
      community_members:   0,
    };
  }
}

// ── Legacy helpers (still used by other callers) ─────────────────────────────

/** Get all platform stats as { key: value } map. Returns {} if table missing. */
async function getAllStats() {
  try {
    const result = await pool.query('SELECT key, value FROM platform_stats');
    const map = {};
    for (const row of result.rows) {
      map[row.key] = Number(row.value);
    }
    return map;
  } catch (err) {
    if (err.message && err.message.includes('does not exist')) return {};
    throw err;
  }
}

/** Get a single stat by key */
async function getStat(key) {
  const result = await pool.query('SELECT value FROM platform_stats WHERE key = $1', [key]);
  return result.rows[0] ? Number(result.rows[0].value) : 0;
}

/** Upsert a stat value */
async function setStat(key, value) {
  await pool.query(
    `INSERT INTO platform_stats (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value]
  );
}

/** Get count of real creators (non-dev, non-banned). Returns 0 if columns missing. */
async function getRealCreatorCount() {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as cnt FROM member_profiles
       WHERE role != 'banned'
         AND is_dev_account = false
         AND email NOT ILIKE '%@wagesociety.com'
         AND email NOT ILIKE '%wagesocietydev%'
         AND email NOT ILIKE '%wagesocietydev%'`
    );
    return Number(result.rows[0]?.cnt || 0);
  } catch (err) {
    if (err.message && err.message.includes('does not exist')) return 0;
    throw err;
  }
}

/** Get live creators for landing page carousel. Filters out dev/internal accounts.
 *  Falls back to offline creators who have connected a streaming platform. */
async function getLiveCreators(limit = 12) {
  try {
    // Live creators first, then offline creators with stream records — all real accounts only
    const result = await pool.query(
      `SELECT ml.display_name, ml.avatar_url, ml.title, ml.category, ml.viewer_count,
              ml.thumbnail_url, ml.total_earned_cents, ml.platform, ml.stream_url, ml.status
       FROM member_livestreams ml
       WHERE ml.email NOT ILIKE '%@wagesociety.com'
         AND ml.email NOT ILIKE '%wagesocietydev%'
         AND ml.email NOT ILIKE 'dev%@%'
       ORDER BY
         CASE ml.status WHEN 'live' THEN 0 ELSE 1 END,
         ml.viewer_count DESC NULLS LAST
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  } catch (err) {
    if (err.message && err.message.includes('does not exist')) return [];
    throw err;
  }
}

/** Count currently live streams */
async function getLiveStreamCount() {
  const result = await pool.query(
    `SELECT COUNT(*) as cnt FROM member_livestreams WHERE status = 'live'`
  );
  return Number(result.rows[0]?.cnt || 0);
}

/** Lightweight HUD stats for /api/homepage-stats (30s polling). */
async function getHudStats() {
  const [stats, activeStreams] = await Promise.all([
    getHomepageStats(),
    getLiveStreamCount(),
  ]);
  return {
    live_now:         activeStreams,
    member_count:     stats.creators_joined,
    active_streams:   activeStreams,
  };
}

module.exports = {
  getHomepageStats,
  getAllStats, getStat, setStat,
  getRealCreatorCount, getLiveCreators, getLiveStreamCount,
  getHudStats,
};