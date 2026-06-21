// db/oauth-providers.js — OAuth connection queries (Google, Kick, Discord account-link).
// Owns: all reads/writes to the oauth_connections table.
// Does NOT own: OAuth flows, token refresh logic, session management.
const { pool } = require('./index');

const PROVIDERS = ['google', 'kick', 'discord'];

/** Find a connection row by provider + provider-assigned user ID. */
async function getByProviderUserId(provider, providerUserId) {
  const result = await pool.query(
    'SELECT * FROM oauth_connections WHERE provider = $1 AND provider_user_id = $2 LIMIT 1',
    [provider, String(providerUserId)]
  );
  return result.rows[0] || null;
}

/** Find a connection row by internal user_id + provider. */
async function getByUserIdAndProvider(userId, provider) {
  const result = await pool.query(
    'SELECT * FROM oauth_connections WHERE user_id = $1 AND provider = $2 LIMIT 1',
    [userId, provider]
  );
  return result.rows[0] || null;
}

/** Upsert an OAuth connection — links on first login, updates on re-link. */
async function upsertConnection({ userId, provider, providerUserId, email, displayName, avatarUrl, accessToken, refreshToken, tokenExpiresAt }) {
  if (!PROVIDERS.includes(provider)) throw new Error(`Invalid provider: ${provider}`);
  const result = await pool.query(
    `INSERT INTO oauth_connections
       (user_id, provider, provider_user_id, email, display_name, avatar_url, access_token, refresh_token, token_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       provider_user_id = EXCLUDED.provider_user_id,
       email            = COALESCE(EXCLUDED.email, oauth_connections.email),
       display_name     = COALESCE(EXCLUDED.display_name, oauth_connections.display_name),
       avatar_url       = COALESCE(EXCLUDED.avatar_url, oauth_connections.avatar_url),
       access_token     = EXCLUDED.access_token,
       refresh_token    = COALESCE(EXCLUDED.refresh_token, oauth_connections.refresh_token),
       token_expires_at = EXCLUDED.token_expires_at,
       updated_at       = now()
     RETURNING *`,
    [userId, provider, String(providerUserId), email || null, displayName || null, avatarUrl || null, accessToken || null, refreshToken || null, tokenExpiresAt || null]
  );
  return result.rows[0];
}

/** Delete a connection (unlink provider from account). */
async function deleteConnection(userId, provider) {
  await pool.query(
    'DELETE FROM oauth_connections WHERE user_id = $1 AND provider = $2',
    [userId, provider]
  );
}

/** Get all connections for a user — includes provider_user_id for display logic. */
async function getUserConnections(userId) {
  const result = await pool.query(
    'SELECT provider, provider_user_id, email, display_name, avatar_url, linked_at, token_expires_at FROM oauth_connections WHERE user_id = $1 ORDER BY linked_at',
    [userId]
  );
  return result.rows;
}

/** Update tokens after a refresh — stores new access_token and expiry. */
async function updateTokens(userId, provider, { accessToken, tokenExpiresAt }) {
  await pool.query(
    `UPDATE oauth_connections SET access_token = $3, token_expires_at = $4, updated_at = now()
     WHERE user_id = $1 AND provider = $2`,
    [userId, provider, accessToken, tokenExpiresAt]
  );
}

module.exports = {
  getByProviderUserId,
  getByUserIdAndProvider,
  upsertConnection,
  deleteConnection,
  getUserConnections,
  updateTokens,
};