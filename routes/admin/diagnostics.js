// routes/admin/diagnostics.js — Admin diagnostics dashboard at /admin/diagnostics.
// Owns: stats overview, audit log, changelog, live console (log viewer + query runner).
// Does NOT own: auth middleware (requireAdmin from lib/middleware).
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../../lib/middleware');
const { pool } = require('../../db/index');
const {
  getSystemStats,
  getAuditLog,
  getAuditLogCount,
  getDistinctActions,
  getChangelog,
  getChangelogCount,
  createChangelogEntry,
  updateChangelogEntry,
  deleteChangelogEntry,
  getSystemInfo,
  getDbPoolStats,
  logAuditEvent,
  getAvailableQuickQueries,
  runQuickQuery,
} = require('../../db/diagnostics');

// In-memory ring buffer for server logs (last 500 lines)
const LOG_BUFFER_SIZE = 500;
const logBuffer = [];
const originalConsoleLog   = console.log;
const originalConsoleError  = console.error;
const originalConsoleWarn   = console.warn;

function pushLog(level, args) {
  const entry = {
    ts:      new Date().toISOString(),
    level,
    message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '),
  };
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
}

console.log = (...args) => { originalConsoleLog(...args); pushLog('info', args); };
console.error = (...args) => { originalConsoleError(...args); pushLog('error', args); };
console.warn = (...args) => { originalConsoleWarn(...args); pushLog('warn', args); };

// ── GET /admin/diagnostics ────────────────────────────────────────────────────
router.get('/', requireAdmin, (_req, res) => {
  res.render('pages/admin-diagnostics', { activeTab: 'diagnostics' });
});

// ── GET /admin/debug → /admin/diagnostics (301) ───────────────────────────────
router.get('/redirect', (req, res) => res.redirect(301, '/admin/diagnostics'));

// ═══════════════════════════════════════════════════════════════════════════════
// TAB A — System Stats
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/api/stats', requireAdmin, async (_req, res) => {
  try {
    const stats = await getSystemStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TAB B — Audit Log
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/api/audit-log', requireAdmin, async (req, res) => {
  try {
    const page      = Math.max(1, parseInt(req.query.page  || '1', 10));
    const pageSize  = 50;
    const offset    = (page - 1) * pageSize;
    const action    = req.query.action || null;

    const [entries, total, actions] = await Promise.all([
      getAuditLog({ action, limit: pageSize, offset }),
      getAuditLogCount(action),
      getDistinctActions(),
    ]);

    res.json({
      entries,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      actions,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TAB C — Changelog
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/api/changelog', requireAdmin, async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = 20;
    const offset   = (page - 1) * pageSize;

    const [entries, total] = await Promise.all([
      getChangelog({ limit: pageSize, offset }),
      getChangelogCount(),
    ]);

    res.json({ entries, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/changelog', requireAdmin, async (req, res) => {
  try {
    const { version, title, description, category, author } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    await logAuditEvent({
      actorEmail:  req.session.userEmail,
      action:     'changelog.created',
      details:    { title, version, category },
      ip:         req.ip,
    });

    const entry = await createChangelogEntry({
      version:    version?.trim() || null,
      title:      title.trim(),
      description: description?.trim() || null,
      category:   category || 'feature',
      author:     author?.trim() || req.session.userEmail,
    });
    res.json({ entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/changelog/:id', requireAdmin, async (req, res) => {
  try {
    const entry = await updateChangelogEntry(parseInt(req.params.id, 10), req.body);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    await logAuditEvent({
      actorEmail:  req.session.userEmail,
      action:     'changelog.updated',
      details:    { id: entry.id, title: entry.title },
      ip:         req.ip,
    });

    res.json({ entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/changelog/:id', requireAdmin, async (req, res) => {
  try {
    const deleted = await deleteChangelogEntry(parseInt(req.params.id, 10));
    if (!deleted) return res.status(404).json({ error: 'Entry not found' });

    await logAuditEvent({
      actorEmail:  req.session.userEmail,
      action:     'changelog.deleted',
      details:    { id: parseInt(req.params.id, 10) },
      ip:         req.ip,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TAB D — Console
// ═══════════════════════════════════════════════════════════════════════════════

// GET /admin/diagnostics/api/logs — live server log buffer
router.get('/api/logs', requireAdmin, (req, res) => {
  const since   = parseInt(req.query.since || '0', 10);
  const lines   = logBuffer.slice(since);
  res.json({ lines, bufferStart: 0, bufferEnd: logBuffer.length });
});

// POST /admin/diagnostics/api/logs/clear — clear the UI log display (no-op on buffer)
router.post('/api/logs/clear', requireAdmin, (_req, res) => {
  res.json({ ok: true });
});

// POST /admin/diagnostics/api/query — read-only SQL query runner
router.post('/api/query', requireAdmin, async (req, res) => {
  const { sql } = req.body;
  if (!sql?.trim()) return res.status(400).json({ error: 'Query is required' });

  const trimmed = sql.trim();

  // Rate limiting: 10 queries per minute per session
  const rateKey = `query:${req.session.userId || req.ip}`;
  const now = Date.now();
  if (!router._rateLimits) router._rateLimits = new Map();
  const limits = router._rateLimits.get(rateKey) || { count: 0, window: now };
  if (now - limits.window > 60_000) {
    limits.count = 0;
    limits.window = now;
  }
  limits.count++;
  router._rateLimits.set(rateKey, limits);
  if (limits.count > 10) {
    return res.status(429).json({ error: 'Rate limit: max 10 queries per minute' });
  }

  // Read-only enforcement
  if (!/^\b(SELECT|WITH)\b/i.test(trimmed)) {
    return res.status(400).json({ error: 'Only SELECT queries are allowed' });
  }

  // Block DDL
  const ddlPattern = /^\b(DROP|TRUNCATE|ALTER|CREATE|RENAME)\b/i;
  if (ddlPattern.test(trimmed)) {
    return res.status(400).json({ error: 'DDL operations are not allowed' });
  }

  // Wrap in READ ONLY transaction
  const start = Date.now();
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN READ ONLY');
    const { rows, fields } = await client.query(trimmed);
    await client.query('COMMIT');

    await logAuditEvent({
      actorEmail:  req.session.userEmail,
      action:      'admin.query_executed',
      details:     { sql_preview: trimmed.slice(0, 150), row_count: rows.length },
      ip:          req.ip,
    });

    res.json({
      rows:        rows.slice(0, 200),  // cap at 200 rows for safety
      fields:      fields.map(f => f.name),
      rowCount:    rows.length,
      duration_ms: Date.now() - start,
      truncated:   rows.length === 200,
    });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    res.status(400).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// GET /admin/diagnostics/api/system-info
router.get('/api/system-info', requireAdmin, async (_req, res) => {
  try {
    const [sysInfo, dbPool] = await Promise.all([
      Promise.resolve().then(() => getSystemInfo()),
      getDbPoolStats(),
    ]);
    res.json({ ...sysInfo, dbPool });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Quick query presets (delegated to db/diagnostics.js — no raw SQL in route)
router.get('/api/quick-queries', requireAdmin, async (req, res) => {
  const { query } = req.query;
  if (query) {
    try {
      const result = await runQuickQuery(query);
      res.json({ query, ...result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  } else {
    const available = await getAvailableQuickQueries();
    res.json({ available });
  }
});

module.exports = router;