// db/account-deletion.js — Self-service account deletion helpers.
// Owns: deletion of auth_users row and all user-scoped data.
// Does NOT own: session management, auth middleware.
const crypto = require('crypto');
const { pool } = require('./index');

// Hard-delete a user account and all associated data.
// Runs in a transaction. Returns { success: true } on commit.
// Throws on any error — caller must handle.
//
// Cascade paths (user_id FK → auth_users.id ON DELETE CASCADE):
//   oauth_connections, livestreams, referrals (referrer_id + referred_user_id),
//   point_transactions, shop_purchases, checkout_sessions, user_roles,
//   discord_oauth_states, discord_servers (owner_wageos_user_id),
//   collab_requests (owner_email FK → member_profiles)
// Manual deletes below cover all other user-scoped tables.
async function deleteAccount(userId, email) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Log deletion to account_deletions BEFORE deleting (non-PII: SHA-256 hash of email)
    const emailHash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
    await client.query(
      `INSERT INTO account_deletions (user_id, email_hash) VALUES ($1, $2)`,
      [userId, emailHash]
    );

    // ── Manual deletes (no ON DELETE CASCADE FK) ───────────────────────────
    // member_livestreams.email
    await client.query(`DELETE FROM member_livestreams WHERE email = $1`, [email]);

    // blog_posts.author_email
    await client.query(`DELETE FROM blog_posts WHERE author_email = $1`, [email]);

    // collab_requests.owner_email
    await client.query(`DELETE FROM collab_requests WHERE owner_email = $1`, [email]);

    // collab_applications.applicant_email
    await client.query(`DELETE FROM collab_applications WHERE applicant_email = $1`, [email]);

    // dashboard_tool_entries.created_by (not email)
    await client.query(`DELETE FROM dashboard_tool_entries WHERE created_by = $1`, [email]);

    // autoclipper_jobs.requested_by (not email)
    await client.query(`DELETE FROM autoclipper_jobs WHERE requested_by = $1`, [email]);

    // newsletter_subscriptions.email
    await client.query(`DELETE FROM newsletter_subscriptions WHERE email = $1`, [email]);

    // org_user_access.email (legacy org role assignments)
    await client.query(`DELETE FROM org_user_access WHERE email = $1`, [email]);

    // discord_links — FK is to auth_users.id via user_id column
    await client.query(`DELETE FROM discord_links WHERE user_id = $1`, [userId]);

    // member_profiles — ON DELETE CASCADE via FK on auth_users.id, but
    // also delete by email to catch rows not linked by FK (dual-key table)
    await client.query(`DELETE FROM member_profiles WHERE email = $1`, [email]);

    // Roles created by this user
    await client.query(`DELETE FROM roles WHERE created_by = $1`, [userId]);

    // The auth_users row itself — all CASCADE FKs above fire on this delete
    await client.query(`DELETE FROM auth_users WHERE id = $1`, [userId]);

    // Future-proof: handle any game-related tables that may exist
    const gameTables = ['game_character_saves', 'game_inventory', 'game_achievements'];
    for (const table of gameTables) {
      try {
        const check = await client.query(
          `SELECT 1 FROM information_schema.tables WHERE table_name = $1`, [table]
        );
        if (check.rows.length > 0) {
          await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
        }
      } catch (_) { /* table doesn't exist — skip */ }
    }

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Get the user's current point balance for the deletion warning.
async function getPointBalance(userId) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) as balance FROM point_transactions WHERE user_id = $1`,
    [userId]
  );
  return parseInt(result.rows[0].balance, 10);
}

module.exports = { deleteAccount, getPointBalance };