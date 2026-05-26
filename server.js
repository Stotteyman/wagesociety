// server.js — WAGE Society Express entry point.
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const path = require('path');
const { pool } = require('./db/index');

const app = express();
const port = process.env.PORT || 3000;

// Render terminates TLS at the reverse proxy — trust it so req.secure works
// and express-session can set secure cookies correctly.
app.set('trust proxy', 1);

// ── Canonical domain redirect — runs BEFORE session middleware ──────────────
// wage-society.polsia.app is a Render alias; ai.wagesociety.com is the canonical
// domain. Force auth-sensitive paths to canonical domain.
app.use((req, res, next) => {
  const AUTH_PATHS = ['/login', '/auth', '/dashboard', '/logout'];
  const isAuthPath = AUTH_PATHS.some(p => req.path === p || req.path.startsWith(p + '/'));
  if (req.hostname === 'wage-society.polsia.app' && isAuthPath) {
    return res.redirect(302, `https://ai.wagesociety.com${req.originalUrl}`);
  }
  next();
});

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

// ── Session middleware — persisted in Postgres via connect-pg-simple ────────
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.error('ERROR: SESSION_SECRET environment variable is required');
  process.exit(1);
}
app.use(session({
  store: new PgSession({ pool, createTableIfMissing: true }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    secure: true,
    sameSite: 'lax',
  },
}));

// Make session available to all EJS templates + currentUser helper
app.use((req, res, next) => {
  res.locals.session = req.session;
  res.locals.currentUser = req.session?.userEmail || null;
  next();
});

// ── JSON + form body parsers ──────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── View engine ──────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Static files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'healthy' }));
app.use('/health/supabase', require('./routes/api/health-supabase'));

// ── Webhook endpoints (raw body required — must be before express.json) ──────
app.use('/webhook', require('./routes/api/webhooks'));

// ── Auth routes (magic link, verify, logout) ─────────────────────────────────
app.use('/auth', require('./routes/auth').router);

// ── Discord OAuth account-linking routes ─────────────────────────────────────
app.use('/auth/discord', require('./routes/discord'));

// ── Password-change enforcement middleware (root admin only) ──────────────────
const { requirePasswordChange } = require('./lib/middleware');
// Apply after session is loaded — before page routes that need auth
app.use(requirePasswordChange);

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',                require('./routes/api/auth'));
app.use('/api/live',                require('./routes/api/live'));
app.use('/api/shop',                require('./routes/api/shop'));
app.use('/api/news',                require('./routes/api/news'));
app.use('/api/public-directory',    require('./routes/api/public-directory'));
app.use('/api/public-profile',      require('./routes/api/public-profile'));
app.use('/api/me',                  require('./routes/api/me'));
app.use('/api/marketing-proof',     require('./routes/api/marketing'));
app.use('/api/check-username',      require('./routes/api/check-username'));
app.use('/api/collab',              require('./routes/api/collab'));
app.use('/api/chatbot',             require('./routes/api/chatbot'));
app.use('/api/donate',              require('./routes/api/donate'));
app.use('/api/admin/users',          require('./routes/api/admin-users'));
app.use('/api/admin/shop',           require('./routes/api/admin-shop'));
app.use('/admin/discord',            require('./routes/admin/discord-resync'));
app.use('/admin/debug',              require('./routes/admin/debug'));
app.use('/api/test-supabase',        require('./routes/api/test-supabase'));

// ── Page routes ─────────────────────────────────────────────────────────────
app.use('/', require('./routes/pages'));

// ── Discord role management — runs once at startup ───────────────────────────
const { ensureRoles } = require('./lib/ensure-discord-roles');
const { syncRolesFromDb } = require('./lib/discord-sync');

function startDiscordRoleManagement() {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId  = process.env.DISCORD_GUILD_ID;

  if (!botToken || !guildId) {
    console.log('[Discord] DISCORD_BOT_TOKEN / DISCORD_GUILD_ID not set — skipping role management');
    return;
  }

  // load DB-cached role IDs first (migrate.js may have already run)
  syncRolesFromDb(pool).then(() => {
    // Then ensure roles exist in the Discord server (creates if missing, stores IDs in DB)
    return ensureRoles(botToken, guildId, pool);
  }).then(({ created, existing }) => {
    if (Object.keys(created).length) {
      console.log(`[Discord] Roles created: ${Object.keys(created).join(', ')}`);
    } else if (Object.keys(existing).length) {
      console.log(`[Discord] Roles verified: ${Object.keys(existing).join(', ')}`);
    } else {
      console.log('[Discord] No roles found — check DISCORD_BOT_TOKEN and DISCORD_GUILD_ID');
    }
  }).catch(err => {
    console.error('[Discord] Role setup error:', err.message);
  });
}

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  startDiscordRoleManagement();
});