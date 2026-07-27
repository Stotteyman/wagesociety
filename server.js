// server.js — WAGE Society Express entry point.
const path = require('path');
const fs = require('fs');
const http = require('http');

// ── dotenv fallback — must run BEFORE pool is created ───────────────────────
// Render injects DATABASE_URL as a Render Environment Variable, but the value
// lives in .env locally. This loader reads .env and fills in any missing vars.
(function loadDotenv() {
  for (const file of ['.env', '.env.local']) {
    const envPath = path.join(__dirname, file);
    if (!fs.existsSync(envPath)) continue;
    const content = fs.readFileSync(envPath, 'utf8');
    // Split on newlines, then on first '=' to handle values with '=' in them
    for (const line of content.split('\n')) {
      const idx = line.indexOf('=');
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      if (!key || key.startsWith('#')) continue;
      const val = line.slice(idx + 1).trim();
      const cur = process.env[key];
      if (!cur || cur === 'undefined' || cur === '') process.env[key] = val;
    }
    console.log(`[dotenv] Env loaded from ${file}`);
  }
})();

const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { pool } = require('./db/index');

const app = express();

// Blaxel forwards the original public host in x-original-host; mirror it onto
// Host + X-Forwarded-Host so host-based logic (redirects, canonical) behaves
// like on Render, whether or not the app trusts the proxy.
app.use((req, _res, next) => {
  const orig = req.headers['x-original-host'];
  if (orig) {
    const h = Array.isArray(orig) ? orig[0] : orig;
    req.headers.host = h;
    req.headers['x-forwarded-host'] = h;
  }
  next();
});
const port = process.env.PORT || 3000;

// Render terminates TLS at the reverse proxy — trust it so req.secure works
// and express-session can set secure cookies correctly.
app.set('trust proxy', 1);

// ── Canonical domain redirect — runs BEFORE session middleware ──────────────
// wage-society.polsia.app is a Render alias; wagesociety.com is the canonical
// domain. Force auth-sensitive paths to canonical domain.
// EXCEPTION: OAuth callback paths must stay on wage-society.polsia.app because
// the OAuth providers (Google, Kick, Discord) have that origin configured as
// their redirect URI. Redirecting callbacks to wagesociety.com breaks auth.
const CANONICAL_DOMAIN = (process.env.APP_URL || 'wagesociety.com').replace(/^https?:\/\//, '');

app.use((req, res, next) => {
  if (req.hostname !== 'wage-society.polsia.app') return next();
  const p = req.path;
  const OAUTH_RE = /^\/auth\/(google|google\/callback|kick|kick\/callback|discord-login|discord-login\/callback|discord|discord\/callback|discord-bot|discord-bot\/callback)/;
  const AUTH_RE  = /^\/(login|dashboard|logout)/;
  if (OAUTH_RE.test(p) || AUTH_RE.test(p)) {
    return res.redirect(302, `https://${CANONICAL_DOMAIN}${req.originalUrl}`);
  }
  next();
});

// ── DATABASE_URL injected by Polsia platform — no hard exit needed ────────
const sessionSecret = process.env.SESSION_SECRET || (() => {
  throw new Error('SESSION_SECRET env var is required in production');
})();
const isLocalhost = (process.env.NODE_ENV || 'development') !== 'production'
  || (process.env.APP_URL || '').startsWith('http://localhost');
const sessionStore = isLocalhost
  ? new session.MemoryStore()
  : new PgSession({ pool, createTableIfMissing: true });
if (isLocalhost) {
  console.warn('[session] Localhost detected — using in-memory session store. Sessions will not persist across restarts.');
}
app.use(session({
  store: sessionStore,
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    secure: !isLocalhost,
    httpOnly: true,
    sameSite: 'lax',
  },
}));

// Make session + user data available to all EJS templates.
app.use(async (req, res, next) => {
  res.locals.session = req.session;
  res.locals.currentUser = req.session?.userEmail || null;
  // Load avatar_url from auth_users so nav and all templates can show it.
  if (req.session?.userEmail) {
    try {
      const { getUserByEmail } = require('./db/users');
      const user = await getUserByEmail(req.session.userEmail);
      res.locals.currentUserAvatar = user?.avatar_url || null;
    } catch (_) {
      res.locals.currentUserAvatar = null;
    }
  } else {
    res.locals.currentUserAvatar = null;
  }
  next();
});

// ── Track last_seen_at for "Community members online" homepage stat ──────────
app.use(require('./lib/middleware').trackLastSeen);

// ── JSON + form body parsers ──────────────────────────────────────────────────
app.use(express.json());
// Convert Express JSON parse failures to structured JSON responses.
// Without this, malformed/empty bodies return raw plain text — clients that
// call r.json() crash on the plain text.
app.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  next(err);
});
app.use(express.urlencoded({ extended: false }));

// ── View engine ──────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Static files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three')));
app.use('/vendor/gsap', express.static(path.join(__dirname, 'node_modules', 'gsap')));
app.use('/vendor/simplex-noise', express.static(path.join(__dirname, 'node_modules', 'simplex-noise')));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'healthy' }));

// ── Discord interaction webhook (raw body required — must be before express.json) ──
app.use('/api/webhooks',            require('./routes/api/webhooks'));
app.use('/api/discord/webhook',      require('./routes/api/discord-webhook'));

// ── Referral code capture (runs on all routes) ─────────────────────────────
app.use(require('./middleware/referral'));

// ── Google OAuth ───────────────────────────────────────────────────────────
app.use('/auth/google', require('./routes/auth-google'));

// ── Kick OAuth ─────────────────────────────────────────────────────────────
app.use('/auth/kick', require('./routes/auth-kick'));

// ── Discord OAuth account-linking routes ─────────────────────────────────────
app.use('/auth/discord', require('./routes/discord'));

// ── Discord bot install OAuth flow (W.A.G.E. Society Bot) ───────────────────
app.use('/auth/discord-bot', require('./routes/auth-discord'));

// ── Discord OAuth as primary login method (separate from account-linking) ──
app.use('/auth/discord-login', require('./routes/auth-discord-login'));

// ── Auth routes — custom email/password + magic link auth ───────────────────
app.use('/auth', require('./routes/auth-custom'));

// ── Password-change enforcement middleware (root admin only) ──────────────────
const { requirePasswordChange, loadUserPermissions } = require('./lib/middleware');
// Apply after session is loaded — before page routes that need auth
app.use(requirePasswordChange);

// Load user roles + permissions into req.user for every authenticated request
app.use(loadUserPermissions);

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',                require('./routes/api/auth'));
app.use('/api/live',                require('./routes/api/live'));
app.use('/api/shop',                require('./routes/api/shop'));
app.use('/api/points-shop',         require('./routes/api/points-shop'));
app.use('/point-shop',              require('./routes/points-shop'));
app.use('/api/news',                require('./routes/api/news'));
app.use('/api/public-directory',    require('./routes/api/public-directory'));
app.use('/api/public-profile',      require('./routes/api/public-profile'));
app.use('/api/me',                  require('./routes/api/me'));
app.use('/api/account',             require('./routes/api/account'));
app.use('/api/points',             require('./routes/api/points-buy'));
app.use('/api/marketing',           require('./routes/api/marketing'));
app.use('/api/check-username',      require('./routes/api/check-username'));
app.use('/api/search',               require('./routes/api/search'));
app.use('/api/collab',              require('./routes/api/collab'));
app.use('/api/chatbot',             require('./routes/api/chatbot'));
app.use('/api/donate',              require('./routes/api/donate'));
app.use('/api/checkout',            require('./routes/api/checkout'));
app.use('/api/admin/users',          require('./routes/api/admin-users'));
app.use('/api/admin/shop',           require('./routes/api/admin-shop'));
app.use('/api/admin/roles',          require('./routes/api/admin-roles'));
app.use('/api/admin/tiers',          require('./routes/api/admin-tiers'));
app.use('/api/admin/discord',        require('./routes/api/admin-discord'));
app.use('/api/admin/referrals',      require('./routes/api/admin-referrals'));
app.use('/admin',                    require('./routes/admin/index'));
app.use('/admin/discord',            require('./routes/admin/discord-resync'));
app.use('/admin/diagnostics',        require('./routes/admin/diagnostics'));
app.get('/admin/debug',              (_req, res) => res.redirect(301, '/admin/diagnostics'));
app.use('/admin/tiers',              require('./routes/admin/tiers-page'));
app.use('/api/discord-servers',       require('./routes/api/discord-servers'));
app.use('/api/discord/role-mappings', require('./routes/api/discord-role-mappings'));
app.use('/api/discord',               require('./routes/api/discord-stats'));
app.use('/api/stats',                 require('./routes/api/stats'));
// Lightweight HUD stats — 30s polling from Three.js portal overlay
app.use('/api/homepage-stats',         require('./routes/api/stats'));
app.use('/api/trial',                  require('./routes/api/trial'));
app.use('/api/subscriptions',           require('./routes/api/subscriptions'));

// ── Referral leaderboard ───────────────────────────────────────────────────
app.use('/', require('./routes/referrals'));

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

// ── Discord bot (event handlers + periodic sync) ─────────────────────────────
const { startBot: initBot } = require('./lib/start-bot');
const httpServer = http.createServer(app);

// ── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(port, () => {
  console.log(`Server running on port ${port}`);
  // Neon cold start can take 10-20s; each retry uses a fresh Pool.
  const { Pool: PgPool } = require('pg');
  const { runMigrations } = require('./migrate');
  const connStr = process.env.DATABASE_URL;
  const sslOpt = connStr && !connStr.includes('localhost') ? { rejectUnauthorized: false } : false;
  // Retry with exponential backoff; max 10 attempts.
  (async function migrateWithRetry() {
    const maxRetries = 10;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const tmpPool = new PgPool({
        connectionString: connStr,
        ssl: sslOpt,
        connectionTimeoutMillis: 20000,
      });
      try {
        await runMigrations(tmpPool);
        await tmpPool.end().catch(() => {});
        console.log('[startup] Migrations applied successfully');
        return;
      } catch (err) {
        await tmpPool.end().catch(() => {});
        const msg = (err.message || '') + ' ' + (err.name || '') + ' ' + String(err);
        const transient = msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')
          || msg.includes('timeout') || msg.includes('AggregateError')
          || msg.includes('Connection terminated') || msg.includes('connection is insecure');
        if (attempt < maxRetries && transient) {
          const delay = Math.min(5000 * Math.pow(1.5, attempt - 1), 30000);
          console.log(`[startup] Migration attempt ${attempt}/${maxRetries} failed (${err.name || 'Error'}), retrying in ${Math.round(delay / 1000)}s...`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          console.error('[startup] Migration error:', msg);
          if (err.stack) console.error(err.stack.split('\n').slice(0, 5).join('\n'));
        }
      }
    }
  })();
  startDiscordRoleManagement();
  initBot(app);
});
