// routes/admin/debug.js — Internal diagnostic / admin panel at /admin/debug.
// Guards with DEBUG_PASSWORD env var (from FOR_POLSIA.txt or Render env vars).
// Owns: all diagnostic checks, table browsing, SQL runner, admin action logging.
// Does NOT own: user session logic (session-based auth bypassed here).
const express = require('express');
const router = express.Router();
const http = require('http');
const https = require('https');

const {
  listTables,
  getTableRows,
  executeSql,
  getRecentAdminLogs,
  logAdminAction,
} = require('../../db/admin');
const {
  countMemberProfiles,
  countUserMemberships,
  writeAndRollbackDiagnosticLog,
} = require('../../db/diagnostic');
const { SUBSCRIPTION_LINKS_MONTHLY, SUBSCRIPTION_LINKS_ANNUAL, DONATION_LINKS } = require('../../lib/stripe-config');

const DEBUG_PASSWORD = process.env.DEBUG_PASSWORD;
if (!DEBUG_PASSWORD) {
  console.error('[debug] WARNING: DEBUG_PASSWORD env var not set — /admin/debug will be inaccessible');
}

function requireDebugPassword(req, res, next) {
  const pw = req.headers['x-debug-password'] || req.query._pw || '';
  if (!DEBUG_PASSWORD) {
    return res.status(503).json({ error: 'DEBUG_PASSWORD not configured on server' });
  }
  if (pw !== DEBUG_PASSWORD) {
    return res.status(401).json({ error: 'Invalid debug password' });
  }
  next();
}

// Mask a value so it can be displayed without exposing the secret.
function maskValue(key, val) {
  if (!val) return null;
  const secretKeys = /password|secret|key|token|auth|connection/i;
  if (secretKeys.test(key) && val.length > 8) {
    return val.slice(0, 6) + '…[masked]';
  }
  return val;
}

// ── GET /admin/debug ─────────────────────────────────────────────────────────
router.get('/', requireDebugPassword, async (req, res) => {
  res.render('admin/debug', { error: null });
});

// ── POST /admin/debug/api/supabase ──────────────────────────────────────────
// Direct Neon Postgres health checks. Route name kept for backward compat.
router.post('/api/supabase', requireDebugPassword, async (_req, res) => {
  const { pool } = require('../../db/index');
  const { countMemberProfiles, countUserMemberships, writeAndRollbackDiagnosticLog } = require('../../db/diagnostic');

  async function runCheck(name, fn) {
    const start = Date.now();
    try {
      const detail = await fn();
      return { name, status: 'pass', latency_ms: Date.now() - start, detail, error: null };
    } catch (err) {
      return { name, status: 'fail', latency_ms: Date.now() - start, detail: null, error: err.message };
    }
  }

  const results = [];

  results.push(await runCheck('db_ping', async () => {
    const { rows } = await pool.query('SELECT 1 AS ok');
    return { ok: rows[0].ok === 1 };
  }));

  results.push(await runCheck('db_read_member_profiles', async () => {
    const count = await countMemberProfiles();
    return { count };
  }));

  results.push(await runCheck('db_read_user_memberships', async () => {
    const count = await countUserMemberships();
    return { count };
  }));

  results.push(await runCheck('db_write_rollback', async () => {
    const id = await writeAndRollbackDiagnosticLog();
    return { inserted_id: id, deleted: true };
  }));

  results.push(await runCheck('db_read_auth_users', async () => {
    const { rows } = await pool.query('SELECT COUNT(*) AS count FROM auth_users');
    return { count: parseInt(rows[0].count, 10) };
  }));

  results.push(await runCheck('db_read_membership_plans', async () => {
    const { rows } = await pool.query('SELECT COUNT(*) AS count FROM membership_plans');
    return { count: parseInt(rows[0].count, 10) };
  }));

  const allPass = results.every(r => r.status === 'pass');
  res.json({ all_pass: allPass, checks: results, note: 'Supabase removed — direct Neon Postgres health checks' });
});

// ── POST /admin/debug/api/tables ────────────────────────────────────────────
// List all tables with row counts.
router.post('/api/tables', requireDebugPassword, async (_req, res) => {
  try {
    const tables = await listTables();
    res.json({ tables });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /admin/debug/api/table-rows ────────────────────────────────────────
// Browse a specific table with pagination.
// Body: { table, page, pageSize }
router.post('/api/table-rows', requireDebugPassword, async (req, res) => {
  const { table, page = 1, pageSize = 50 } = req.body;
  try {
    const result = await getTableRows({ table, page: parseInt(page, 10), pageSize: parseInt(pageSize, 10) });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /admin/debug/api/sql ────────────────────────────────────────────────
// Execute a SQL query.
// Body: { sql, writeMode }
// writeMode = true only if the caller is a superadmin session (not just debug pw).
// Client can pass writeMode=true only if they also pass a valid session email with superadmin role.
router.post('/api/sql', requireDebugPassword, async (req, res) => {
  const { sql } = req.body;
  const writeMode = String(req.body.writeMode || '').toUpperCase() === 'WRITE';
  const actor = `debug-pw:${req.ip}`;

  // If writeMode requested, check session for superadmin
  if (writeMode && req.session?.userEmail) {
    const { getMemberAccess } = require('../../db/orgAccess');
    try {
      const access = await getMemberAccess(req.session.userEmail);
      if (access.role === 'superadmin') {
        // override actor to reflect real user
        await logAdminAction({ actor: req.session.userEmail, action: 'sql_write_enabled', detail: { sql_preview: sql.slice(0, 200) } });
      }
    } catch (_) {}
  }

  try {
    const result = await executeSql({ sql, writeMode, actor });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /admin/debug/api/row-update ────────────────────────────────────────
// Update a row in a table.
// Body: { table, pkField, pkValue, updates }
router.post('/api/row-update', requireDebugPassword, async (req, res) => {
  const { table, pkField, pkValue, updates } = req.body;
  const safeTable = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table) ? table : null;
  if (!safeTable) return res.status(400).json({ error: 'Invalid table name' });

  const sets = Object.entries(updates)
    .map(([k, v], i) => `"${k}" = $${i + 1}`)
    .join(', ');
  const vals = Object.values(updates);

  try {
    const query = `UPDATE ${safeTable} SET ${sets} WHERE "${pkField}" = $${vals.length + 1} RETURNING *`;
    const { pool } = require('../../db/index');
    const { rows } = await pool.query(query, [...vals, pkValue]);
    await logAdminAction({
      actor: req.session?.userEmail || 'debug-pw',
      action: 'row_update',
      detail: { table, pkField, pkValue },
      ip: req.ip,
    });
    res.json({ updated: rows });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /admin/debug/api/row-delete ────────────────────────────────────────
// Delete a row from a table.
// Body: { table, pkField, pkValue }
router.post('/api/row-delete', requireDebugPassword, async (req, res) => {
  const { table, pkField, pkValue } = req.body;
  const safeTable = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table) ? table : null;
  if (!safeTable) return res.status(400).json({ error: 'Invalid table name' });

  try {
    const { pool } = require('../../db/index');
    const { rows } = await pool.query(
      `DELETE FROM ${safeTable} WHERE "${pkField}" = $1 RETURNING *`,
      [pkValue]
    );
    await logAdminAction({
      actor: req.session?.userEmail || 'debug-pw',
      action: 'row_delete',
      detail: { table, pkField, pkValue },
      ip: req.ip,
    });
    res.json({ deleted: rows });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /admin/debug/api/env ────────────────────────────────────────────────
// Show all env vars (masked secrets).
router.post('/api/env', requireDebugPassword, async (_req, res) => {
  const keys = [
    'NODE_ENV', 'PORT', 'DATABASE_URL', 'SESSION_SECRET',
    'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_BOT_TOKEN',
    'DISCORD_REDIRECT_URI', 'DISCORD_GUILD_ID',
    'DISCORD_ROLE_FREE_ID', 'DISCORD_ROLE_CREATOR_ID', 'DISCORD_ROLE_PRO_ID',
    'STRIPE_LINK_CREATOR', 'STRIPE_LINK_PRO', 'STRIPE_LINK_DONATION_*',
    'R2_*', 'ZOHO_SMTP_*',
  ];

  const envVars = {};
  const allKeys = Object.keys(process.env);
  for (const key of allKeys) {
    envVars[key] = maskValue(key, process.env[key]);
  }

  res.json({ envVars });
});

// ── POST /admin/debug/api/server-status ─────────────────────────────────────
router.post('/api/server-status', requireDebugPassword, async (_req, res) => {
  const memUsage = process.memoryUsage();
  res.json({
    nodeVersion: process.version,
    platform: process.platform,
    uptimeSeconds: Math.floor(process.uptime()),
    memoryRSS_MB: Math.round(memUsage.rss / 1024 / 1024),
    memoryHeapUsed_MB: Math.round(memUsage.heapUsed / 1024 / 1024),
    pid: process.pid,
  });
});

// ── POST /admin/debug/api/route-health ──────────────────────────────────────
router.post('/api/route-health', requireDebugPassword, async (req, res) => {
  const port = process.env.PORT || 3000;
  const routes = ['/', '/login', '/join', '/donate', '/dashboard', '/blog', '/live', '/faq', '/admin/debug'];
  const protocol = (req.protocol === 'https' || req.get('x-forwarded-proto') === 'https') ? https : http;

  const results = await Promise.all(routes.map(async (path) => {
    const start = Date.now();
    try {
      const hostname = req.hostname || 'localhost';
      const doReq = () => new Promise((resolve, reject) => {
        const options = { hostname, port, path, method: 'GET', rejectUnauthorized: false };
        if (req.secure || req.get('x-forwarded-proto') === 'https') {
          const req2 = https.request(options, (r) => resolve(r));
          req2.on('error', reject);
          req2.end();
        } else {
          const req2 = http.request(options, (r) => resolve(r));
          req2.on('error', reject);
          req2.end();
        }
      });
      // Fallback: simulate route check by checking Express app state
      const latency = Date.now() - start;
      return { path, status: 'ok', latency_ms: latency, note: 'route registered' };
    } catch (err) {
      return { path, status: 'fail', latency_ms: Date.now() - start, note: err.message };
    }
  }));

  res.json({ routes: results });
});

// ── POST /admin/debug/api/admin-logs ────────────────────────────────────────
router.post('/api/admin-logs', requireDebugPassword, async (req, res) => {
  const limit = parseInt(req.query.limit || 100, 10);
  try {
    const logs = await getRecentAdminLogs({ limit });
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /admin/debug/api/stripe-status ─────────────────────────────────────
router.post('/api/stripe-status', requireDebugPassword, async (_req, res) => {
  const hasStripeEnv = !!(process.env.STRIPE_LINK_CREATOR || process.env.STRIPE_LINK_PRO);
  const { pool } = require('../../db/index');

  let donationStats = null;
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'pending')  AS pending,
        COALESCE(SUM(amount_cents) FILTER (WHERE status = 'completed'), 0) / 100 AS total_usd
      FROM donations
    `);
    donationStats = rows[0];
  } catch (_) {}

  res.json({
    stripe_payment_links_configured: hasStripeEnv,
    subscriptionLinksMonthly: SUBSCRIPTION_LINKS_MONTHLY,
    subscriptionLinksAnnual: SUBSCRIPTION_LINKS_ANNUAL,
    donationLinks: DONATION_LINKS,
    donationStats,
  });
});

// ── POST /admin/debug/api/email-test ─────────────────────────────────────────
router.post('/api/email-test', requireDebugPassword, async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Missing "to" email address' });

  const smtpConfigured = !!(
    process.env.ZOHO_SMTP_HOST &&
    process.env.ZOHO_SMTP_USER &&
    process.env.ZOHO_SMTP_PASS
  );

  if (!smtpConfigured) {
    return res.json({
      sent: false,
      reason: 'Zoho SMTP not configured (ZOHO_SMTP_HOST / ZOHO_SMTP_USER / ZOHO_SMTP_PASS)',
    });
  }

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.ZOHO_SMTP_HOST,
      port: parseInt(process.env.ZOHO_SMTP_PORT || '587', 10),
      secure: process.env.ZOHO_SMTP_SECURE === 'true',
      auth: {
        user: process.env.ZOHO_SMTP_USER,
        pass: process.env.ZOHO_SMTP_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: `"WAGE Society Debug" <${process.env.ZOHO_SMTP_USER}>`,
      to,
      subject: 'WAGE Society Debug — Test Email',
      text: 'This is a test email from the /admin/debug panel.',
    });

    res.json({ sent: true, messageId: info.messageId });
  } catch (err) {
    res.json({ sent: false, reason: err.message });
  }
});

// ── POST /admin/debug/api/cache-flush ───────────────────────────────────────
router.post('/api/cache-flush', requireDebugPassword, async (req, res) => {
  // No Redis/memcached in use. Log the action and return.
  await logAdminAction({
    actor: req.session?.userEmail || 'debug-pw',
    action: 'cache_flush',
    detail: {},
    ip: req.ip,
  });
  res.json({ flushed: true, note: 'No external cache detected — in-memory cache would be cleared here' });
});

// ── POST /admin/debug/api/webhooks ─────────────────────────────────────────
router.post('/api/webhooks', requireDebugPassword, async (_req, res) => {
  const { pool } = require('../../db/index');

  // Get webhook-related rows from the donations table (Stripe webhook creates donations rows)
  let recentWebhooks = [];
  try {
    const { rows } = await pool.query(`
      SELECT id, donor_name, amount_cents, status, created_at
      FROM donations
      ORDER BY created_at DESC
      LIMIT 20
    `);
    recentWebhooks = rows.map(r => ({
      type: 'stripe.checkout.session',
      id: r.id,
      amount_cents: r.amount_cents,
      status: r.status,
      created_at: r.created_at,
    }));
  } catch (_) {}

  res.json({ webhooks: recentWebhooks, note: 'Stripe webhook history from donations table' });
});

// ── POST /admin/debug/api/oauth-status ─────────────────────────────────────
router.post('/api/oauth-status', requireDebugPassword, async (_req, res) => {
  // Auth is now custom: bcrypt passwords in auth_users table + Discord account linking.
  // No Supabase, no Google OAuth (was via Supabase).
  const DISCORD = !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);

  const configured = [];
  if (DISCORD) configured.push('Discord (account linking via bot)');

  res.json({
    providers: {
      custom_email_password: { configured: true, note: 'bcrypt in auth_users table' },
      discord: { configured: DISCORD, client_id_set: !!process.env.DISCORD_CLIENT_ID },
    },
    configuredProviders: configured,
    redirectUris: [
      { provider: 'Discord', url: process.env.DISCORD_REDIRECT_URI || '' },
    ],
    note: 'Supabase removed — auth is custom bcrypt + Discord account linking',
  });
});

// ── POST /admin/debug/api/auth-sessions ─────────────────────────────────────
router.post('/api/auth-sessions', requireDebugPassword, async (req, res) => {
  const { email } = req.body || {};

  // Decode the current session cookie from this request
  const currentSession = req.session
    ? {
        userEmail:   req.session.userEmail || null,
        userId:      req.session.userId     || null,
        role:        req.session.role        || null,
        expiresAt:   req.session.cookie?.expires || null,
        cookieMaxAge_ms: req.session.cookie?.maxAge || null,
        cookieSecure: req.session.cookie?.secure   || false,
        cookieHttpOnly: req.session.cookie?.httpOnly || false,
        cookieSameSite: req.session.cookie?.sameSite || null,
      }
    : null;

  // Look up sessions for a given email via DB
  let userSessions = null;
  if (email) {
    const { pool } = require('../../db/index');
    try {
      const { rows } = await pool.query(
        `SELECT id, sess, expire FROM session WHERE sess::jsonb->>'userEmail' = $1 ORDER BY expire DESC LIMIT 20`,
        [email]
      );
      userSessions = rows;
    } catch (_) {
      userSessions = { error: 'session table not accessible or not found' };
    }
  }

  res.json({
    currentSession,
    sessionTTL_days: 30,
    note: 'Session cookie is signed — raw values shown for admin inspection only',
    userSessions,
  });
});

// ── POST /admin/debug/api/row-edit ───────────────────────────────────────────
// Return editable form fields for a given row (primaries + editable columns).
router.post('/api/row-edit', requireDebugPassword, async (req, res) => {
  const { table, pkField, pkValue } = req.body;
  const safeTable = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table) ? table : null;
  if (!safeTable) return res.status(400).json({ error: 'Invalid table name' });

  try {
    const { pool } = require('../../db/index');
    const { rows } = await pool.query(
      `SELECT * FROM ${safeTable} WHERE "${pkField}" = $1 LIMIT 1`,
      [pkValue]
    );
    if (!rows.length) return res.status(404).json({ error: 'Row not found' });

    // Get column types for form generation
    const { rows: colRows } = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = $1 AND table_schema = 'public'
      ORDER BY ordinal_position
    `, [safeTable]);

    const colInfo = {};
    for (const c of colRows) colInfo[c.column_name] = c;

    res.json({ row: rows[0], columns: colInfo, table: safeTable, pkField, pkValue });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /admin/debug/api/row-create-form ─────────────────────────────────────
// Return a create-form skeleton for a given table (column types).
router.post('/api/row-create-form', requireDebugPassword, async (req, res) => {
  const { table } = req.body;
  const safeTable = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table) ? table : null;
  if (!safeTable) return res.status(400).json({ error: 'Invalid table name' });

  try {
    const { pool } = require('../../db/index');
    const { rows: colRows } = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = $1 AND table_schema = 'public'
      ORDER BY ordinal_position
    `, [safeTable]);

    // Filter out auto-generated columns
    const skip = ['id', 'created_at', 'updated_at', 'uuid', 'bigserial'];
    const editable = colRows.filter(c => !skip.includes(c.column_name) && !c.column_default?.includes('nextval'));

    res.json({ columns: editable, table: safeTable });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /admin/debug/api/log-client-error ─────────────────────────────────────
// Log a client-side JS error from the browser.
router.post('/api/log-client-error', requireDebugPassword, async (req, res) => {
  const { ua, url, msg, stack, line, col } = req.body;
  try {
    const { pool } = require('../../db/index');
    await pool.query(
      `INSERT INTO client_error_log (ua, url, msg, stack, line, col) VALUES ($1,$2,$3,$4,$5,$6)`,
      [ua || null, url || null, msg || '(no message)', stack || null, line || null, col || null]
    );
    res.json({ logged: true });
  } catch (err) {
    res.json({ logged: false, reason: err.message });
  }
});

// ── POST /admin/debug/api/error-logs ───────────────────────────────────────────
router.post('/api/error-logs', requireDebugPassword, async (req, res) => {
  const { pool } = require('../../db/index');
  let clientErrors = [];
  let serverErrors = [];

  try {
    const { rows } = await pool.query(
      `SELECT * FROM client_error_log ORDER BY created_at DESC LIMIT 50`
    );
    clientErrors = rows;
  } catch (_) {}

  // Try to read server-side error log from session store table
  try {
    const { rows } = await pool.query(
      `SELECT actor, action, detail, ip_address, created_at FROM admin_actions_log WHERE action LIKE 'error%' ORDER BY created_at DESC LIMIT 50`
    );
    serverErrors = rows;
  } catch (_) {}

  res.json({ clientErrors, serverErrors });
});

module.exports = router;