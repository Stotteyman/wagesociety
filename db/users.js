// db/users.js — User query helpers.
// Owns: all reads/writes to the auth_users table.
// Does NOT own: session management, middleware, Supabase auth.
const { pool } = require('./index');

const TABLE = 'auth_users';

/** Find a user by email. Returns the full row or null. */
async function getUserByEmail(email) {
  const result = await pool.query(
    `SELECT * FROM ${TABLE} WHERE email = $1 LIMIT 1`,
    [email.toLowerCase().trim()]
  );
  return result.rows[0] || null;
}

/** Find a user by ID. */
async function getUserById(id) {
  const result = await pool.query(`SELECT * FROM ${TABLE} WHERE id = $1 LIMIT 1`, [id]);
  return result.rows[0] || null;
}

/** Create a new user with email + bcrypt password hash + auto-generated referral code. */
async function createUser({ email, passwordHash, displayName, referredBy }) {
  const { generateUniqueReferralCode } = require('../lib/referral-codes');
  const referralCode = await generateUniqueReferralCode();
  const result = await pool.query(
    `INSERT INTO ${TABLE} (email, password_hash, display_name, role, tier, referral_code, referred_by)
     VALUES ($1, $2, $3, 'member', 'FREE', $4, $5)
     RETURNING id, email, role, tier, referral_code`,
    [email.toLowerCase().trim(), passwordHash, displayName || email.split('@')[0], referralCode, referredBy || null]
  );
  return result.rows[0];
}

/** Backfill referral codes for existing users who don't have one. */
async function backfillReferralCodes() {
  const { generateUniqueReferralCode } = require('../lib/referral-codes');

  // Get all users without a referral code
  const users = await pool.query(
    `SELECT id FROM ${TABLE} WHERE referral_code IS NULL`
  );

  let updated = 0;
  for (const user of users.rows) {
    const code = await generateUniqueReferralCode();
    if (!code) {
      console.error(`[backfill] Failed to generate code for user ${user.id} after 5 attempts — skipping`);
      continue;
    }
    await pool.query(
      `UPDATE ${TABLE} SET referral_code = $1 WHERE id = $2 AND referral_code IS NULL`,
      [code, user.id]
    );
    updated++;
  }

  console.log(`[backfill] Assigned referral codes to ${updated} existing users`);
  return updated;
}

/** Update magic link token and sent timestamp for a user. */
async function setMagicLinkToken(email, token) {
  await pool.query(
    `UPDATE ${TABLE} SET magic_link_token = $2, magic_link_sent_at = now(), updated_at = now()
     WHERE email = $1`,
    [email.toLowerCase().trim(), token]
  );
}

/** Consume and clear a magic link token if valid and not expired (15 min). */
async function consumeMagicLink(token) {
  const result = await pool.query(
    `UPDATE ${TABLE}
     SET magic_link_token = null, magic_link_sent_at = null, updated_at = now()
     WHERE magic_link_token = $1
       AND magic_link_sent_at > now() - interval '15 minutes'
     RETURNING id, email, role, tier`,
    [token]
  );
  return result.rows[0] || null;
}

/** Update user display_name and avatar_url. */
async function updateUserProfile(id, { displayName, avatarUrl }) {
  await pool.query(
    `UPDATE ${TABLE} SET display_name = $2, avatar_url = $3, updated_at = now()
     WHERE id = $1`,
    [id, displayName, avatarUrl]
  );
}

/** Update auth_users.avatar_url only (used by avatar upload — preserves display_name). */
async function updateUserAvatarUrl(id, avatarUrl) {
  await pool.query(
    `UPDATE ${TABLE} SET avatar_url = $2, updated_at = now() WHERE id = $1`,
    [id, avatarUrl]
  );
}

/** Upsert a user — update if exists, create if not. Used for OAuth fallback.
 *  If email is null (OAuth without email scope), generates a synthetic email so
 *  the NOT NULL constraint on auth_users.email is satisfied. */
async function upsertUser({ email, displayName, avatarUrl, externalAuthId, externalProvider }) {
  // Canonicalize email — null becomes a synthetic placeholder so we can still
  // upsert by email when the provider doesn't return one (Kick/Discord no-email).
  const canonicalEmail = (email || `${externalProvider || 'oauth'}:${externalAuthId}@wage.local`).toLowerCase().trim();
  const result = await pool.query(
    `INSERT INTO ${TABLE} (email, display_name, avatar_url, external_auth_id, external_provider, role, tier)
     VALUES ($1, $2, $3, $4, $5, 'member', 'FREE')
     ON CONFLICT (email) DO UPDATE SET
       display_name = COALESCE($2, ${TABLE}.display_name),
       avatar_url   = COALESCE($3, ${TABLE}.avatar_url),
       external_auth_id   = COALESCE($4, ${TABLE}.external_auth_id),
       external_provider  = COALESCE($5, ${TABLE}.external_provider),
       updated_at = now()
     RETURNING id, email, role, tier`,
    [canonicalEmail, displayName, avatarUrl, externalAuthId, externalProvider]
  );
  return result.rows[0];
}

/** Set admin-initiated password reset token. */
async function setAdminResetToken(email, token) {
  await pool.query(
    `UPDATE ${TABLE} SET admin_reset_token = $2, admin_reset_sent_at = now(), updated_at = now()
     WHERE email = $1`,
    [email.toLowerCase().trim(), token]
  );
}

/** Consume admin reset token (valid 1 hour, single-use). */
async function consumeAdminResetToken(token) {
  const result = await pool.query(
    `UPDATE ${TABLE}
     SET admin_reset_token = null, admin_reset_sent_at = null, updated_at = now()
     WHERE admin_reset_token = $1
       AND admin_reset_sent_at > now() - interval '1 hour'
     RETURNING id, email, role, tier`,
    [token]
  );
  return result.rows[0] || null;
}

/** Set a new password for a user (admin or self-serve). */
async function setUserPassword(email, passwordHash) {
  await pool.query(
    `UPDATE ${TABLE} SET password_hash = $2, updated_at = now() WHERE email = $1`,
    [email.toLowerCase().trim(), passwordHash]
  );
}

/** Toggle suspended flag. */
async function setUserSuspended(email, suspended) {
  await pool.query(
    `UPDATE ${TABLE} SET is_suspended = $2, updated_at = now() WHERE email = $1`,
    [email.toLowerCase().trim(), suspended]
  );
}

/** Update password hash directly (admin-set password). */
async function updateUserPasswordHash(id, passwordHash) {
  await pool.query(
    `UPDATE ${TABLE} SET password_hash = $2, updated_at = now() WHERE id = $1`,
    [id, passwordHash]
  );
}

/** Bump last_seen_at for a user (called by session middleware, throttled in-memory). */
async function touchLastSeen(userId) {
  await pool.query(
    `UPDATE ${TABLE} SET last_seen_at = NOW() WHERE id = $1`,
    [userId]
  );
}

module.exports = {
  getUserByEmail,
  getUserById,
  createUser,
  setMagicLinkToken,
  consumeMagicLink,
  updateUserProfile,
  updateUserAvatarUrl,
  upsertUser,
  setAdminResetToken,
  consumeAdminResetToken,
  setUserPassword,
  setUserSuspended,
  updateUserPasswordHash,
  backfillReferralCodes,
  touchLastSeen,
};