// db/discord.js — Discord link queries.
// Owns: upsert/get/delete/update rows in discord_links keyed by user_id.
// Does NOT own OAuth flow, token refresh logic, or role sync.
const { pool } = require('./index');

// Look up a discord link row by the internal users.id (integer)
async function getDiscordLinkByUserId(userId) {
  const result = await pool.query(
    'SELECT * FROM discord_links WHERE user_id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

// Look up the users.id for a given email (needed to join on FK)
async function getUserIdByEmail(email) {
  const result = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [email.toLowerCase()]
  );
  return result.rows[0]?.id || null;
}

// Upsert a Discord link row — inserts on first link, updates on re-link
async function upsertDiscordLink({
  userId,
  discordId,
  discordUsername,
  discordAvatar,
  accessToken,
  refreshToken,
  tokenExpiresAt,
}) {
  await pool.query(
    `INSERT INTO discord_links
       (user_id, discord_id, discord_username, discord_avatar, access_token, refresh_token, token_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id)
     DO UPDATE SET
       discord_id       = EXCLUDED.discord_id,
       discord_username = EXCLUDED.discord_username,
       discord_avatar   = EXCLUDED.discord_avatar,
       access_token     = EXCLUDED.access_token,
       refresh_token    = EXCLUDED.refresh_token,
       token_expires_at = EXCLUDED.token_expires_at,
       linked_at        = now()`,
    [userId, discordId, discordUsername, discordAvatar || null, accessToken, refreshToken, tokenExpiresAt]
  );
}

// Delete the discord link for a user (unlink)
async function deleteDiscordLinkByUserId(userId) {
  await pool.query('DELETE FROM discord_links WHERE user_id = $1', [userId]);
}

// Get the email address for a user by their integer ID
async function getUserEmailById(userId) {
  const result = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.email || null;
}

// Get all discord_links rows joined with user email — used for bulk re-sync
async function getAllLinkedUsers() {
  const result = await pool.query(
    'SELECT dl.user_id, u.email FROM discord_links dl JOIN users u ON u.id = dl.user_id ORDER BY dl.linked_at DESC'
  );
  return result.rows;
}

// Partial update — pass only the fields you want to change.
// Supports: access_token, refresh_token, token_expires_at, last_synced_at
async function updateDiscordLink(userId, fields) {
  const allowed = ['access_token', 'refresh_token', 'token_expires_at', 'last_synced_at'];
  const keys = Object.keys(fields).filter(k => allowed.includes(k));
  if (!keys.length) return;
  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = [userId, ...keys.map(k => fields[k])];
  await pool.query(`UPDATE discord_links SET ${setClauses} WHERE user_id = $1`, values);
}

module.exports = {
  getDiscordLinkByUserId,
  getUserIdByEmail,
  getUserEmailById,
  getAllLinkedUsers,
  upsertDiscordLink,
  deleteDiscordLinkByUserId,
  updateDiscordLink,
};
