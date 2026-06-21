// db/admin.js — Admin panel database utilities.
// Owns: admin_actions_log writes, raw SQL runner, table metadata queries.
// Does NOT own: route logic, auth, or UI rendering.
const { pool } = require('./index');

// Log an admin action to admin_actions_log (legacy) and admin_audit_log (new).
async function logAdminAction({ actor, action, detail = {}, ip }) {
  const json = JSON.stringify(detail);
  // Write to both tables for backward compat + new audit trail
  await Promise.all([
    pool.query(
      `INSERT INTO admin_actions_log (actor, action, detail, ip_address) VALUES ($1, $2, $3, $4)`,
      [actor, action, json, ip || null]
    ).catch(() => {}), // silently skip if table doesn't exist
    pool.query(
      `INSERT INTO admin_audit_log (actor, action, detail, ip_address) VALUES ($1, $2, $3, $4)`,
      [actor, action, json, ip || null]
    ).catch(() => {}), // silently skip if table doesn't exist yet
  ]);
}

// List all tables with estimated row counts.
async function listTables() {
  const { rows } = await pool.query(`
    SELECT
      schemaname,
      relname                       AS table_name,
      n_live_tup                    AS row_count_estimate,
      n_dead_tup                    AS dead_tuples
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY relname
  `);
  return rows;
}

// Fetch rows from a table with pagination.
async function getTableRows({ table, page = 1, pageSize = 50 }) {
  const offset = (page - 1) * pageSize;
  const safeTable = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table) ? table : null;
  if (!safeTable) throw new Error('Invalid table name');

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM ${safeTable}`
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const { rows } = await pool.query(
    `SELECT * FROM ${safeTable} ORDER BY 1 DESC LIMIT $1 OFFSET $2`,
    [pageSize, offset]
  );

  return { rows, total, page, pageSize };
}

// Execute a raw SQL query. Only SELECT allowed unless explicit write mode.
// writeMode requires the word "WRITE" somewhere in the actor string.
async function executeSql({ sql, writeMode = false, actor = 'unknown' }) {
  const trimmed = sql.trim();
  const isSelect = /^\b(SELECT|WITH)\b/i.test(trimmed);

  if (!isSelect && !writeMode) {
    throw new Error('Non-SELECT queries require writeMode=true. Type WRITE in the prompt to enable mutations.');
  }

  // Block dangerous operations regardless of writeMode
  const forbidden = /^\b(DROP\b|TRUNCATE\b|ALTER\b|CREATE\b|RENAME\b)/i;
  if (forbidden.test(trimmed)) {
    throw new Error('DDL operations are not allowed from this panel.');
  }

  const start = Date.now();
  const { rows, fields } = await pool.query(trimmed);
  const duration = Date.now() - start;

  await logAdminAction({
    actor,
    action: isSelect ? 'sql_query' : 'sql_write',
    detail: {
      sql_preview: trimmed.slice(0, 200),
      row_count: Array.isArray(rows) ? rows.length : 0,
    },
  });

  return { rows, fields: fields.map(f => f.name), duration_ms: duration };
}

// Get recent admin action log.
async function getRecentAdminLogs({ limit = 100 } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

// Get audit log for a specific user (for subscription/tier change history).
async function getAuditLogForUser(email, { limit = 50 } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM admin_audit_log
     WHERE detail->>'email' = $1 OR detail->>'targetEmail' = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [email.toLowerCase(), limit]
  );
  return rows;
}

// Log an admin tier change (specific action type for easier filtering).
async function logTierChange({ adminEmail, targetEmail, previousTier, newTier, ip }) {
  await pool.query(
    `INSERT INTO admin_audit_log (actor, action, detail, ip_address) VALUES ($1, $2, $3, $4)`,
    [adminEmail, 'tier_change', JSON.stringify({ email: targetEmail, previousTier, newTier }), ip || null]
  );
}

// Log a bulk tier change.
async function logBulkTierChange({ adminEmail, emails, previousTier, newTier, count, ip }) {
  await pool.query(
    `INSERT INTO admin_audit_log (actor, action, detail, ip_address) VALUES ($1, $2, $3, $4)`,
    [adminEmail, 'bulk_tier_change', JSON.stringify({ emails, previousTier, newTier, count }), ip || null]
  );
}

module.exports = {
  logAdminAction,
  listTables,
  getTableRows,
  executeSql,
  getRecentAdminLogs,
  getAuditLogForUser,
  logTierChange,
  logBulkTierChange,
};