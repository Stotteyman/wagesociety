// db/profiles.js — Member profile queries.
const { pool } = require('./index');

const MEMBERS_WITH_PERMS = new Set(['superadmin','admin','manager','staff','helper','user']);

function hasCreatorTools(role, permissions) {
  return MEMBERS_WITH_PERMS.has(role) && permissions.includes('view_creator_tools');
}

async function getProfileByEmail(email) {
  const result = await pool.query(
    'SELECT * FROM member_profiles WHERE email = $1', [email.toLowerCase()]
  );
  return result.rows[0] || null;
}

async function getProfileByUsername(username) {
  const result = await pool.query(
    'SELECT * FROM member_profiles WHERE username = $1', [username]
  );
  return result.rows[0] || null;
}

async function upsertProfile(email, data) {
  const { username, display_name, bio, avatar_url, skills, primary_platform, featured_youtube_channel_id, youtube_channel_name, youtube_channel_avatar } = data;
  const result = await pool.query(
    `INSERT INTO member_profiles (email, username, display_name, bio, avatar_url, skills, primary_platform, featured_youtube_channel_id, youtube_channel_name, youtube_channel_avatar)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (email) DO UPDATE SET
       username=COALESCE($2, member_profiles.username),
       display_name=COALESCE($3, member_profiles.display_name),
       bio=COALESCE($4, member_profiles.bio),
       avatar_url=COALESCE($5, member_profiles.avatar_url),
       skills=COALESCE($6, member_profiles.skills),
       primary_platform=COALESCE($7, member_profiles.primary_platform),
       featured_youtube_channel_id=COALESCE($8, member_profiles.featured_youtube_channel_id),
       youtube_channel_name=COALESCE($9, member_profiles.youtube_channel_name),
       youtube_channel_avatar=COALESCE($10, member_profiles.youtube_channel_avatar),
       updated_at=NOW()
     RETURNING *`,
    [email.toLowerCase(), username || email.split('@')[0], display_name, bio, avatar_url, skills || null, primary_platform || null, featured_youtube_channel_id || null, youtube_channel_name || null, youtube_channel_avatar || null]
  );
  return result.rows[0];
}

async function getPublicDirectory({ search = '', sort = 'recent', page = 1, perPage = 20, tier = null } = {}) {
  const offset = (page - 1) * perPage;
  const hasSearch = search.trim().length > 0;
  const searchPattern = hasSearch ? `%${search.trim()}%` : null;
  const hasTier = tier && ['creator', 'pro', 'elite', 'unlimited', 'free'].includes(tier);

  const orderBy = sort === 'tier'
    ? `d.tier_order DESC, d.created_at DESC`
    : sort === 'alpha'
    ? `LOWER(COALESCE(d.display_name, d.username)) ASC`
    : `d.created_at DESC`;

  // Build base subquery — filters banned/dev accounts and internal email domains
  // ORDER BY uses um.created_at DESC so latest membership is preferred (no sort_order col)
  const baseFrom = `
    FROM (
      SELECT DISTINCT ON (mp.email)
             mp.email, mp.username, mp.display_name, mp.avatar_url, mp.bio, mp.skills,
             mp.connected_count, mp.created_at, mp.primary_platform,
             COALESCE(au.tier, um.plan_slug, 'free') as membership_tier,
             CASE COALESCE(au.tier, um.plan_slug, 'free') WHEN 'pro' THEN 3 WHEN 'elite' THEN 4 WHEN 'unlimited' THEN 5 WHEN 'creator' THEN 2 ELSE 1 END as tier_order,
             au.referral_tier
      FROM member_profiles mp
      INNER JOIN auth_users au ON au.email = mp.email
      LEFT JOIN user_memberships um ON um.email = mp.email AND um.status IN ('active','trialing')
      WHERE mp.role != 'banned'
        AND mp.is_dev_account = false
        AND au.is_dev_account = false
        AND mp.email NOT ILIKE '%@wagesociety.com'
        AND mp.email NOT ILIKE '%wagesocietydev%'
        AND mp.email NOT ILIKE 'dev%'
    ` + (hasSearch
      ? ` AND (mp.username ILIKE $1 OR mp.display_name ILIKE $1 OR mp.bio ILIKE $1)`
      : '') + (hasTier
      ? ` AND COALESCE(au.tier, um.plan_slug, 'free') = $${hasSearch ? 2 : 1}`
      : '') + `
      ORDER BY mp.email, um.created_at DESC NULLS LAST
    ) d
  `;

  // Count
  const countSql = `SELECT COUNT(*)::int AS total ${baseFrom}`;
  const countParams = hasSearch && hasTier
    ? [searchPattern, tier]
    : hasSearch
    ? [searchPattern]
    : hasTier
    ? [tier]
    : [];
  const countRows = await pool.query(countSql, countParams);
  const total = countRows.rows[0]?.total || 0;

  // Data: join live status
  const dataSql = `
    SELECT d.*, ls.status as is_live
    ${baseFrom}
    LEFT JOIN member_livestreams ls ON ls.email = d.email AND ls.status = 'live'
    ORDER BY ${orderBy}
    LIMIT $${hasSearch + hasTier + 1} OFFSET $${hasSearch + hasTier + 2}
  `;
  const dataParams = [...countParams, perPage, offset];
  const dataRows = await pool.query(dataSql, dataParams);

  return { members: dataRows.rows, total, page, perPage };
}

// Direct SET (not COALESCE) so "None" selection clears the value to null.
async function setPrimaryPlatform(email, platform) {
  await pool.query(
    'UPDATE member_profiles SET primary_platform = $2, updated_at = NOW() WHERE email = $1',
    [email.toLowerCase(), platform]
  );
}

async function setMustChangePassword(email, value) {
  await pool.query(
    'UPDATE member_profiles SET must_change_password = $2, updated_at = NOW() WHERE email = $1',
    [email.toLowerCase(), value]
  );
}

async function getMustChangePassword(email) {
  const result = await pool.query(
    'SELECT must_change_password FROM member_profiles WHERE email = $1',
    [email.toLowerCase()]
  );
  return result.rows[0]?.must_change_password || false;
}

async function getPublicProfileByUsername(username) {
  // DISTINCT ON prevents duplicates when user_memberships has multiple active rows
  // Roles use `priority` column (not `sort_order`); memberships use `created_at` (not `sort_order`)
  const profile = await pool.query(
    `SELECT DISTINCT ON (mp.email)
            mp.username, mp.display_name, mp.avatar_url, mp.bio, mp.skills,
            mp.connected_count, mp.created_at, mp.email,
            mp.youtube_channel_name, mp.youtube_channel_avatar,
            COALESCE(au.tier, um.plan_slug, 'free') as membership_tier,
            COALESCE(r.name, our.role, mp_role.name, 'member') as role,
            au.referral_tier
     FROM member_profiles mp
     INNER JOIN auth_users au ON au.email = mp.email
     LEFT JOIN user_memberships um ON um.email = mp.email AND um.status IN ('active','trialing')
     LEFT JOIN membership_plans mp_role ON mp_role.slug = um.plan_slug
     LEFT JOIN user_roles ur ON ur.user_id = au.id
     LEFT JOIN roles r ON r.id = ur.role_id
     LEFT JOIN org_user_roles our ON our.email = au.email
     WHERE mp.username = $1 AND mp.role != 'banned' AND mp.is_dev_account = false
       AND mp.email NOT ILIKE '%@wagesociety.com'
       AND mp.email NOT ILIKE '%wagesocietydev%'
       AND mp.email NOT ILIKE 'dev%'
     ORDER BY mp.email, r.priority DESC NULLS LAST, um.created_at DESC NULLS LAST`, [username]
  );
  if (!profile.rows[0]) return null;

  // Pull real OAuth-linked accounts (not livestreams) for the Connected Accounts section.
  // Join via auth_users.id since oauth_connections.user_id is a UUID FK to auth_users.
  const oauthConns = await pool.query(
    `SELECT oc.provider, oc.display_name, oc.avatar_url
     FROM oauth_connections oc
     JOIN auth_users au ON au.id = oc.user_id
     WHERE au.email = $1
     ORDER BY oc.linked_at`, [profile.rows[0].email]
  );

  const accounts = oauthConns.rows.map(c => ({
    // Show "YouTube" label for Google connections, not "google"
    platform: c.provider === 'google' ? 'youtube' : c.provider,
    // Privacy: for Google, show YouTube channel name — never Google real name
    display_name: c.provider === 'google'
      ? (profile.rows[0].youtube_channel_name || 'YouTube')
      : (c.display_name || c.provider),
  }));

  return { ...profile.rows[0], connectedAccounts: accounts };
}

async function getProfileEmailByUsername(username) {
  const result = await pool.query(
    'SELECT email FROM member_profiles WHERE username = $1',
    [username]
  );
  return result.rows[0]?.email || null;
}

/** Featured creators for hero section — returns up to `limit` real profiles with avatars.
 *  Also fetches earnings from member_livestreams if the creator has a stream record. */
async function getHeroCreators(limit = 6) {
  const result = await pool.query(
    `SELECT mp.username, mp.display_name, mp.avatar_url,
            COALESCE(um.plan_slug, 'free') AS membership_tier,
            COALESCE(
              (SELECT SUM(ml.total_earned_cents) FROM member_livestreams ml WHERE ml.email = mp.email AND ml.status = 'live'),
              (SELECT SUM(total_earned_cents) FROM member_livestreams WHERE email = mp.email)
            , 0) AS total_earned_cents
     FROM member_profiles mp
     INNER JOIN auth_users au ON au.email = mp.email
     LEFT JOIN user_memberships um ON um.email = mp.email AND um.status IN ('active','trialing')
     WHERE mp.role != 'banned'
       AND mp.is_dev_account = false
       AND au.is_dev_account = false
       AND mp.avatar_url IS NOT NULL
       AND mp.avatar_url != ''
       AND mp.email NOT ILIKE '%@wagesociety.com'
       AND mp.email NOT ILIKE '%wagesocietydev%'
       AND mp.email NOT ILIKE 'dev%'
     ORDER BY mp.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/** Total creator count for social proof */
async function getCreatorCount() {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM member_profiles mp
     INNER JOIN auth_users au ON au.email = mp.email
     WHERE mp.role != 'banned'
       AND mp.is_dev_account = false
       AND au.is_dev_account = false
       AND mp.email NOT ILIKE '%@wagesociety.com'
       AND mp.email NOT ILIKE '%wagesocietydev%'
       AND mp.email NOT ILIKE 'dev%'`
  );
  return result.rows[0]?.count || 0;
}

module.exports = {
  getProfileByEmail, getProfileByUsername, upsertProfile,
  getPublicDirectory, getPublicProfileByUsername,
  setMustChangePassword, getMustChangePassword, setPrimaryPlatform,
  getProfileEmailByUsername, getHeroCreators, getCreatorCount,
  hasCreatorTools, MEMBERS_WITH_PERMS,
};