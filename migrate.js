/**
 * Database Migration Runner
 * Runs on every deploy via `npm run build` (standalone) and at server startup.
 * Supports both .js (module.exports.up) and .sql migration files.
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

/**
 * Run pending migrations against the given pool.
 * Exported so server.js can call it at startup with the shared pool.
 */
async function runMigrations(pool) {
  console.log('Running migrations...');
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ   DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id                     SERIAL PRIMARY KEY,
        email                  VARCHAR(255) NOT NULL,
        name                   VARCHAR(255),
        password_hash          VARCHAR(255),
        created_at             TIMESTAMPTZ DEFAULT NOW(),
        updated_at             TIMESTAMPTZ DEFAULT NOW(),
        stripe_subscription_id VARCHAR(255),
        subscription_status    VARCHAR(50),
        subscription_plan      VARCHAR(255),
        subscription_expires_at TIMESTAMPTZ,
        subscription_updated_at TIMESTAMPTZ
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (LOWER(email))`);
    await client.query(`CREATE INDEX IF NOT EXISTS users_stripe_subscription_id_idx ON users (stripe_subscription_id)`);

    await runFolderMigrations(client);
    console.log('Migrations complete.');
  } finally {
    client.release();
  }
}

async function runFolderMigrations(client) {
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.js') || f.endsWith('.sql'))
    .sort();

  const applied = await client.query('SELECT name FROM _migrations');
  const appliedNames = new Set(applied.rows.map(r => r.name));

  for (const file of files) {
    const name = file.replace(/\//g, '_').replace(/\\/g, '_');
    if (appliedNames.has(name)) continue;

    console.log(`Running migration: ${name}`);
    try {
      await client.query('BEGIN');
      if (file.endsWith('.sql')) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await client.query(sql);
      } else {
        const migration = require(path.join(migrationsDir, file));
        if (typeof migration.up !== 'function') {
          throw new Error(`Migration ${name} missing .up function`);
        }
        await migration.up(client);
      }
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`Migration complete: ${name}`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      const detail = err.message || String(err);
      console.error(`Migration error [${name}]: ${detail}`);
      if (err.stack) console.error(err.stack.split('\n').slice(0, 5).join('\n'));
      throw new Error(`Migration failed (${name}): ${detail}`);
    }
  }
}

module.exports = { runMigrations };

// ── dotenv fallback (Render doesn't auto-inject DATABASE_URL) ──────────────
function loadDotenvEnv() {
  for (const file of ['.env', '.env.local']) {
    const envPath = path.join(__dirname, file);
    if (!fs.existsSync(envPath)) continue;
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
    console.log(`[dotenv] Loaded env vars from ${file}`);
  }
}
loadDotenvEnv();

// ── Standalone execution (npm run build / npm run migrate) ────────────────
// Retries on Neon cold-start ECONNREFUSED / ENOTFOUND / timeout errors.
if (require.main === module) {
  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    console.log('DATABASE_URL not set — skipping migrations (will run at startup)');
    process.exit(0);
  }
  const pool = new Pool({
    connectionString: connStr,
    ssl: connStr.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  (async function migrateWithRetry() {
    const MAX_RETRIES = 7;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await runMigrations(pool);
        await pool.end();
        return;
      } catch (err) {
        const msg = (err.message || '') + ' ' + (err.name || '') + ' ' + String(err);
        const isTransient = msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')
          || msg.includes('timeout') || msg.includes('AggregateError')
          || msg.includes('Connection terminated') || msg.includes('connection is insecure');
        if (attempt < MAX_RETRIES && isTransient) {
          const delay = Math.min(attempt * 3000, 15000);
          console.log(`[migrate] Attempt ${attempt}/${MAX_RETRIES} failed (${err.name || 'Error'}), retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          console.error('Migration failed:', msg);
          await pool.end().catch(() => {});
          process.exit(1);
        }
      }
    }
  })();
}
