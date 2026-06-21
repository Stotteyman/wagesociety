// db/discord-servers.js — Discord server management queries.
const { pool } = require('./index');

// Upsert a discord_servers row. Creates if absent, updates existing.
async function upsertServer({ guildId, name, iconUrl, ownerDiscordId }) {
  const result = await pool.query(
    `INSERT INTO discord_servers (guild_id, name, icon_url, owner_discord_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (guild_id) DO UPDATE SET
       name              = EXCLUDED.name,
       icon_url          = EXCLUDED.icon_url,
       owner_discord_id  = COALESCE(EXCLUDED.owner_discord_id, discord_servers.owner_discord_id),
       updated_at        = NOW()
     RETURNING *`,
    [guildId, name || null, iconUrl || null, ownerDiscordId || null]
  );
  return result.rows[0];
}

// Get a server by guild_id
async function getServerByGuildId(guildId) {
  const result = await pool.query(
    'SELECT * FROM discord_servers WHERE guild_id = $1',
    [guildId]
  );
  return result.rows[0] || null;
}

// List all servers for a WAGE Society user.
// Returns servers the user owns AND servers where the bot is installed
// but no one has claimed yet (so the UI can show "Claim this server").
async function listServersByUser(userId) {
  const result = await pool.query(
    `SELECT ds.*,
            dsc.auto_role_free, dsc.auto_role_creator, dsc.auto_role_pro,
            dsc.welcome_channel_id, dsc.log_channel_id,
            dsc.greetings_enabled, dsc.mod_commands_enabled
     FROM discord_servers ds
     LEFT JOIN discord_server_configs dsc ON dsc.server_id = ds.id
     WHERE ds.owner_wageos_user_id = $1
        OR (ds.owner_wageos_user_id IS NULL AND ds.connected_at IS NOT NULL)
     ORDER BY ds.connected_at DESC NULLS LAST, ds.created_at DESC`,
    [userId]
  );
  return result.rows;
}

// Mark a server as connected (bot joined)
async function markServerConnected(guildId, inviteCode) {
  const result = await pool.query(
    `UPDATE discord_servers
     SET connected_at = NOW(), invite_code = $2, updated_at = NOW()
     WHERE guild_id = $1
     RETURNING *`,
    [guildId, inviteCode || null]
  );
  return result.rows[0] || null;
}

// Claim a server: associate a WAGEOS user with a guild they own via Discord OAuth
async function claimServer(guildId, wageosUserId, ownerDiscordId) {
  const result = await pool.query(
    `UPDATE discord_servers
     SET owner_wageos_user_id = $2,
         owner_discord_id    = COALESCE($3, owner_discord_id),
         updated_at          = NOW()
     WHERE guild_id = $1
     RETURNING *`,
    [guildId, wageosUserId, ownerDiscordId || null]
  );
  return result.rows[0] || null;
}

// Create default config for a server (id)
async function createDefaultConfig(serverId) {
  const result = await pool.query(
    `INSERT INTO discord_server_configs (server_id)
     VALUES ($1)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [serverId]
  );
  return result.rows[0] || null;
}

// Update server config fields
async function updateServerConfig(serverId, fields) {
  const allowed = [
    'auto_role_free', 'auto_role_creator', 'auto_role_pro',
    'welcome_channel_id', 'log_channel_id',
    'greetings_enabled', 'mod_commands_enabled',
  ];
  const keys = Object.keys(fields).filter(k => allowed.includes(k));
  if (!keys.length) return null;
  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = [serverId, ...keys.map(k => fields[k] ?? null)];
  const result = await pool.query(
    `UPDATE discord_server_configs SET ${setClauses}, updated_at = NOW()
     WHERE server_id = $1 RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

// Check if a user owns a server (returns the row if ownership verified)
async function getServerOwnership(guildId, userId) {
  const result = await pool.query(
    'SELECT * FROM discord_servers WHERE guild_id = $1 AND owner_wageos_user_id = $2',
    [guildId, userId]
  );
  return result.rows[0] || null;
}

// Increment/decrement the cached member_count for a guild (delta can be negative)
async function updateServerMemberCount(guildId, delta) {
  await pool.query(
    `UPDATE discord_servers
     SET member_count = COALESCE(member_count, 0) + $2,
         updated_at = NOW()
     WHERE guild_id = $1`,
    [guildId, delta]
  );
}

// Store the auto-created WAGE Society Member role ID for a guild
async function updateWageRoleId(guildId, wageRoleId) {
  await pool.query(
    `UPDATE discord_servers SET wage_role_id = $2, updated_at = NOW() WHERE guild_id = $1`,
    [guildId, wageRoleId]
  );
}

// Get all connected servers (bot is active)
async function getConnectedServers() {
  const result = await pool.query(
    'SELECT guild_id, wage_role_id FROM discord_servers WHERE connected_at IS NOT NULL'
  );
  return result.rows;
}

module.exports = {
  upsertServer,
  getServerByGuildId,
  listServersByUser,
  markServerConnected,
  claimServer,
  createDefaultConfig,
  updateServerConfig,
  getServerOwnership,
  updateServerMemberCount,
  updateWageRoleId,
  getConnectedServers,
};