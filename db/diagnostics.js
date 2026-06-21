// db/diagnostics.js — Platform diagnostics, stats, audit log, and changelog queries.
// Owns: stats aggregation, audit log reads, changelog CRUD.
// Does NOT own: route logic, UI rendering, log buffering.
const { pool } = require('./index');

// ── System Stats ──────────────────────────────────────────────────────────────

async function getSystemStats() {
  const now = new Date();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [userStats, subStats, contentStats, pointsStats, referralStats] = await Promise.all([

    // User counts
    pool.query(`
      SELECT
        COUNT(*)::int                                          AS total_users,
        COUNT(*) FILTER (WHERE last_seen_at >= $1)::int       AS active_users_7d,
        COUNT(*) FILTER (WHERE created_at >= $1)::int          AS new_signups_7d,
        COUNT(*) FILTER (WHERE created_at >= $2)::int          AS new_signups_30d
      FROM auth_users
      WHERE is_suspended = false
    `, [weekAgo.toISOString(), monthAgo.toISOString()]),

    // Subscription tiers
    pool.query(`
      SELECT
        COALESCE(u.tier, 'free')    AS tier,
        COUNT(DISTINCT u.id)::int   AS user_count
      FROM auth_users u
      WHERE u.is_suspended = false
      GROUP BY 1
      ORDER BY
        CASE COALESCE(u.tier, 'free')
          WHEN 'unlimited' THEN 1 WHEN 'elite' THEN 2 WHEN 'pro' THEN 3
          WHEN 'creator'   THEN 4 WHEN 'free'   THEN 5 ELSE 99
        END
    `),

    // Content counts
    Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM member_profiles'),
      pool.query('SELECT COUNT(*)::int AS count FROM member_livestreams'),
      pool.query('SELECT COUNT(*)::int AS count FROM merch_items'),
      pool.query('SELECT COUNT(*)::int AS count FROM blog_posts'),
    ]).then(([profiles, streams, merch, posts]) => ({
      profiles: profiles.rows[0]?.count || 0,
      streams:  streams.rows[0]?.count  || 0,
      merch:    merch.rows[0]?.count     || 0,
      posts:    posts.rows[0]?.count    || 0,
    })),

    // Points stats
    pool.query(`
      SELECT
        COALESCE(SUM(amount), 0)::int           AS total_in_circulation,
        COALESCE(SUM(amount) FILTER (WHERE created_at >= $1), 0)::int AS earned_this_week,
        COALESCE(SUM(-amount) FILTER (WHERE created_at >= $1), 0)::int AS redeemed_this_week
      FROM point_transactions
    `, [weekAgo.toISOString()]),

    // Referral stats
    pool.query(`
      SELECT
        COUNT(*)::int                                     AS total_referrals,
        COUNT(*) FILTER (WHERE rc.active = true)::int      AS active_codes,
        COUNT(*) FILTER (WHERE r.status = 'completed')::int AS converted
      FROM referrals r
      JOIN referral_codes rc ON rc.id = r.referral_code_id
    `),

  ]);

  // MRR estimate from membership_tiers
  let mrrEstimate = 0;
  try {
    const { rows } = await pool.query(`
      SELECT COALESCE(SUM(price_cents), 0)::int AS mrr_cents
      FROM membership_tiers
      WHERE is_active = true AND price_cents > 0
    `);
    mrrEstimate = Math.round((rows[0]?.mrr_cents || 0) / 100);
  } catch (_) {}

  return {
    users:     userStats.rows[0],
    tiers:     subStats.rows,
    content:   contentStats,
    points:    pointsStats.rows[0],
    referrals: referralStats.rows[0],
    mrrEstimate,
  };
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

async function getAuditLog({ action, limit = 50, offset = 0 } = {}) {
  const params = [];
  let where = '';
  if (action) {
    where = 'WHERE action = $1';
    params.push(action);
  }
  params.push(limit, offset);

  const { rows } = await pool.query(`
    SELECT * FROM admin_audit_log
    ${where}
    ORDER BY created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params);

  return rows;
}

async function getAuditLogCount(action) {
  const params = action ? [action] : [];
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM admin_audit_log${action ? ' WHERE action = $1' : ''}`,
    params
  );
  return rows[0]?.total || 0;
}

async function logAuditEvent({ actorId, actorEmail, action, targetType, targetId, details = {}, ip }) {
  await pool.query(
    `INSERT INTO admin_audit_log (actor, action, detail, ip_address)
     VALUES ($1, $2, $3, $4)`,
    [
      actorEmail || actorId || 'system',
      action,
      JSON.stringify({ actorId, targetType, targetId, ...details }),
      ip || null,
    ]
  );
}

async function getDistinctActions() {
  const { rows } = await pool.query(
    `SELECT DISTINCT action FROM admin_audit_log ORDER BY action`
  );
  return rows.map(r => r.action);
}

// ── Changelog ─────────────────────────────────────────────────────────────────

async function getChangelog({ limit = 20, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM changelog ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

async function getChangelogCount() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM changelog');
  return rows[0]?.total || 0;
}

async function createChangelogEntry({ version, title, description, category, author }) {
  const { rows } = await pool.query(
    `INSERT INTO changelog (version, title, description, category, author)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [version || null, title, description || null, category || 'feature', author || null]
  );
  return rows[0];
}

async function updateChangelogEntry(id, { version, title, description, category, author }) {
  const { rows } = await pool.query(
    `UPDATE changelog
     SET version = COALESCE($2, version),
         title = COALESCE($3, title),
         description = COALESCE($4, description),
         category = COALESCE($5, category),
         author = COALESCE($6, author)
     WHERE id = $1
     RETURNING *`,
    [id, version, title, description, category, author]
  );
  return rows[0];
}

async function deleteChangelogEntry(id) {
  const { rows } = await pool.query(
    `DELETE FROM changelog WHERE id = $1 RETURNING id`,
    [id]
  );
  return rows[0]?.id === id;
}

// ── System Info ───────────────────────────────────────────────────────────────

function getSystemInfo() {
  const mem = process.memoryUsage();
  return {
    nodeVersion:      process.version,
    environment:      process.env.NODE_ENV || 'development',
    uptimeSeconds:    Math.floor(process.uptime()),
    pid:              process.pid,
    memoryRSS_MB:     Math.round(mem.rss / 1024 / 1024),
    memoryHeap_MB:    Math.round(mem.heapUsed / 1024 / 1024),
    memoryTotal_MB:   Math.round(mem.heapTotal / 1024 / 1024),
    lastRestartAt:    process.env.LAST_RESTART_AT || null,
    buildSha:         process.env.BUILD_SHA || null,
  };
}

async function getDbPoolStats() {
  const { pool } = require('./index');
  return {
    totalCount:    pool.totalCount,
    idleCount:     pool.idleCount,
    waitingCount:  pool.waitingCount,
  };
}

// Pre-built quick query SQL strings (read-only, no user input)
const QUICK_QUERIES = {
  users_with_tiers:    `SELECT email, username, tier, role, created_at FROM auth_users ORDER BY created_at DESC LIMIT 50`,
  subscription_counts: `SELECT COALESCE(tier,'free') AS tier, COUNT(*)::int AS count FROM auth_users GROUP BY 1 ORDER BY 2 DESC`,
  recent_signups:      `SELECT email, username, created_at FROM auth_users WHERE is_suspended = false ORDER BY created_at DESC LIMIT 20`,
  points_leaderboard:  `SELECT u.username, COALESCE(SUM(pt.amount),0)::int AS total_pts
                         FROM auth_users u
                         LEFT JOIN point_transactions pt ON pt.user_id = u.id
                         GROUP BY u.username ORDER BY total_pts DESC LIMIT 20`,
  active_referrals:    `SELECT rc.code, rc.active, rc.tier, u.email AS owner_email, COUNT(r.id)::int AS uses
                         FROM referral_codes rc
                         JOIN auth_users u ON u.id = rc.user_id
                         LEFT JOIN referrals r ON r.referral_code_id = rc.id
                         GROUP BY rc.code, rc.active, rc.tier, u.email ORDER BY uses DESC LIMIT 20`,
  recent_donations:    `SELECT donor_name, amount_cents/100.0 AS amount_usd, status, created_at FROM donations ORDER BY created_at DESC LIMIT 20`,
};

async function getAvailableQuickQueries() {
  return Object.keys(QUICK_QUERIES);
}

async function runQuickQuery(queryKey) {
  const sql = QUICK_QUERIES[queryKey];
  if (!sql) throw new Error('Unknown quick query: ' + queryKey);
  const start = Date.now();
  const { rows, fields } = await pool.query(sql);
  return { rows: rows.slice(0, 200), fields: fields.map(f => f.name), duration_ms: Date.now() - start, truncated: rows.length > 200 };
}

module.exports = {
  getSystemStats,
  getAuditLog,
  getAuditLogCount,
  logAuditEvent,
  getDistinctActions,
  getChangelog,
  getChangelogCount,
  createChangelogEntry,
  updateChangelogEntry,
  deleteChangelogEntry,
  getSystemInfo,
  getDbPoolStats,
  getAvailableQuickQueries,
  runQuickQuery,
};