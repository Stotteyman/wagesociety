// db/discord-admin.js — Queries for the /admin/discord management page.
// Owns: discord_bot_settings, discord_tier_role_map, discord_bot_logs reads/writes.
// Does NOT own: discord_links, discord_servers, or role sync logic.
const { pool } = require('./index');

// ── Bot Settings (key-value) ────────────────────────────────────────────────

async function getAllSettings() {
  const { rows } = await pool.query('SELECT key, value FROM discord_bot_settings ORDER BY key');
  const settings = {};
  for (const r of rows) {
    // JSONB values are stored as JSON strings — unwrap one level
    try { settings[r.key] = typeof r.value === 'string' ? JSON.parse(r.value) : r.value; }
    catch { settings[r.key] = r.value; }
  }
  return settings;
}

async function setSetting(key, value) {
  const jsonVal = JSON.stringify(value);
  await pool.query(
    `INSERT INTO discord_bot_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
    [key, jsonVal]
  );
}

async function setSettingsBulk(kvPairs) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [key, value] of Object.entries(kvPairs)) {
      const jsonVal = JSON.stringify(value);
      await client.query(
        `INSERT INTO discord_bot_settings (key, value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
        [key, jsonVal]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Tier → Role Map ────────────────────────────────────────────────────────

async function getTierRoleMap() {
  const { rows } = await pool.query(
    'SELECT tier, discord_role_name, discord_role_id FROM discord_tier_role_map ORDER BY id'
  );
  return rows;
}

async function upsertTierRole(tier, roleName, roleId) {
  await pool.query(
    `INSERT INTO discord_tier_role_map (tier, discord_role_name, discord_role_id, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (tier) DO UPDATE SET discord_role_name = $2, discord_role_id = $3, updated_at = NOW()`,
    [tier, roleName, roleId || null]
  );
}

// ── Bot Logs ───────────────────────────────────────────────────────────────

async function insertLog(event, { userId, discordUserId, serverId, details } = {}) {
  await pool.query(
    `INSERT INTO discord_bot_logs (event, user_id, discord_user_id, server_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [event, userId || null, discordUserId || null, serverId || null, JSON.stringify(details || {})]
  );
}

async function getLogs({ event, limit = 50, offset = 0 } = {}) {
  let sql = `SELECT id, event, user_id, discord_user_id, server_id, details, created_at
             FROM discord_bot_logs`;
  const params = [];
  if (event) {
    sql += ' WHERE event = $1';
    params.push(event);
  }
  sql += ' ORDER BY created_at DESC';
  sql += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function getLogCount(event) {
  let sql = 'SELECT COUNT(*)::int as count FROM discord_bot_logs';
  const params = [];
  if (event) {
    sql += ' WHERE event = $1';
    params.push(event);
  }
  const { rows } = await pool.query(sql, params);
  return rows[0]?.count || 0;
}

async function getLatestFailure() {
  const { rows } = await pool.query(
    `SELECT id, event, server_id, details, created_at
     FROM discord_bot_logs
     WHERE event ILIKE '%error%'
        OR event ILIKE '%fail%'
        OR COALESCE(details->>'status', '') = 'failed'
     ORDER BY created_at DESC
     LIMIT 1`
  );
  return rows[0] || null;
}

async function listAllServers() {
  const { rows } = await pool.query(
    `SELECT guild_id, name, icon_url, owner_discord_id, member_count,
            wage_role_id, connected_at, updated_at
     FROM discord_servers
     ORDER BY (guild_id = $1) DESC, connected_at DESC NULLS LAST, updated_at DESC`,
    [process.env.DISCORD_GUILD_ID || '']
  );
  return rows;
}

// ── Linked user count ──────────────────────────────────────────────────────

async function getLinkedUserCount() {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int as count FROM discord_links WHERE user_id IS NOT NULL'
  );
  return rows[0]?.count || 0;
}

module.exports = {
  getAllSettings,
  setSetting,
  setSettingsBulk,
  getTierRoleMap,
  upsertTierRole,
  insertLog,
  getLogs,
  getLogCount,
  getLatestFailure,
  listAllServers,
  getLinkedUserCount,
};
