// db/adminUsers.js — Admin user management queries.
// Owns: user list queries, membership lookups, auth user updates.
// Does NOT own: role management (db/orgAccess.js), session management.
const { pool } = require('./index');

const TABLE = 'auth_users';
const PROFILES = 'member_profiles';

/** List all users with their role, membership, and point balance.
 *  Uses subqueries for roles and memberships to avoid row multiplication
 *  when a user has multiple role assignments or membership records. */
async function listAllUsers(limit = 200) {
  const result = await pool.query(
    `SELECT
       au.id, au.email, au.display_name, au.avatar_url, au.role, au.tier,
       au.is_suspended, au.created_at, au.referral_points, au.referral_tier,
       mp.username,
       COALESCE(top_role.name, our.role, mp.role, 'member') as effective_role,
       br.banned_by, br.ban_reason, br.banned_until,
       COALESCE(au.tier, top_um.plan_slug, 'free') as display_tier,
       top_um.plan_slug, top_um.status as membership_status,
       top_um.current_period_end, top_um.stripe_customer_id
     FROM ${TABLE} au
     LEFT JOIN ${PROFILES} mp ON mp.email = au.email
     LEFT JOIN LATERAL (
       SELECT r.name, r.priority FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = au.id ORDER BY r.priority DESC LIMIT 1
     ) top_role ON true
     LEFT JOIN org_user_roles our ON our.email = au.email
     LEFT JOIN org_ban_records br ON br.email = au.email
     LEFT JOIN LATERAL (
       SELECT um.plan_slug, um.status, um.current_period_end, um.stripe_customer_id
       FROM user_memberships um WHERE um.email = au.email
         AND um.status IN ('active','trialing','past_due')
       ORDER BY um.current_period_end DESC NULLS LAST LIMIT 1
     ) top_um ON true
     ORDER BY au.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/** Get a single user with membership info. */
async function getUserWithMembership(email) {
  const result = await pool.query(
    `SELECT
       au.id, au.email, au.display_name, au.avatar_url, au.role, au.tier,
       au.is_suspended, au.created_at,
       mp.username,
       um.plan_slug, um.status as membership_status,
       um.current_period_end, um.stripe_customer_id, um.stripe_subscription_id
     FROM ${TABLE} au
     LEFT JOIN ${PROFILES} mp ON mp.email = au.email
     LEFT JOIN user_memberships um ON um.email = au.email
     WHERE au.email = $1`,
    [email.toLowerCase().trim()]
  );
  return result.rows[0] || null;
}

module.exports = { listAllUsers, getUserWithMembership };