// db/discord-oauth-states.js — Short-lived OAuth CSRF states for Discord bot install flow.
// Owns: insert/purge discord_oauth_states rows.
// Does NOT own the OAuth handshake itself, token exchange, or user/guild fetching.
const { pool } = require('./index');

// Store a CSRF state with associated user and intended redirect path.
async function createState(state, userId, redirectPath) {
  const result = await pool.query(
    `INSERT INTO discord_oauth_states (state, user_id, redirect_path)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [state, userId, redirectPath || null]
  );
  return result.rows[0];
}

// Consume and delete a state — returns the row if valid, null if missing/expired.
// States are single-use: deleting on read prevents replay attacks.
async function consumeState(state) {
  const result = await pool.query(
    `DELETE FROM discord_oauth_states
     WHERE state = $1
       AND created_at > NOW() - INTERVAL '10 minutes'
     RETURNING *`,
    [state]
  );
  return result.rows[0] || null;
}

// Cleanup expired states older than 10 minutes (called periodically).
async function purgeExpiredStates() {
  await pool.query(
    `DELETE FROM discord_oauth_states
     WHERE created_at < NOW() - INTERVAL '10 minutes'`
  );
}

module.exports = { createState, consumeState, purgeExpiredStates };