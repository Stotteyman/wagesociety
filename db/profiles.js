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
  const { username, display_name, bio, avatar_url, skills } = data;
  const result = await pool.query(
    `INSERT INTO member_profiles (email, username, display_name, bio, avatar_url, skills)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (email) DO UPDATE SET
       username=COALESCE($2, member_profiles.username),
       display_name=COALESCE($3, member_profiles.display_name),
       bio=COALESCE($4, member_profiles.bio),
       avatar_url=COALESCE($5, member_profiles.avatar_url),
       skills=COALESCE($6, member_profiles.skills),
       updated_at=NOW()
     RETURNING *`,
    [email.toLowerCase(), username || email.split('@')[0], display_name, bio, avatar_url, skills || null]
  );
  return result.rows[0];
}

async function getPublicDirectory(limit = 500) {
  const result = await pool.query(
    `SELECT mp.username, mp.display_name, mp.avatar_url, mp.bio, mp.skills, mp.connected_count,
            COALESCE(um.plan_slug, 'free') as membership_tier
     FROM member_profiles mp
     INNER JOIN users u ON u.email = mp.email
     LEFT JOIN user_memberships um ON um.email = mp.email AND um.status IN ('active','trialing')
     WHERE mp.role != 'banned'
     ORDER BY mp.created_at DESC
     LIMIT $1`, [limit]
  );
  return result.rows;
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
  const profile = await pool.query(
    `SELECT mp.username, mp.display_name, mp.avatar_url, mp.bio, mp.skills,
            mp.connected_count, mp.created_at, mp.email,
            COALESCE(um.plan_slug, 'free') as membership_tier,
            mp_role.name as role
     FROM member_profiles mp
     INNER JOIN users u ON u.email = mp.email
     LEFT JOIN user_memberships um ON um.email = mp.email AND um.status IN ('active','trialing')
     LEFT JOIN membership_plans mp_role ON mp_role.slug = um.plan_slug
     WHERE mp.username = $1 AND mp.role != 'banned'`, [username]
  );
  if (!profile.rows[0]) return null;

  const streams = await pool.query(
    `SELECT platform, stream_url, title, display_name as channel_name, avatar_url, status
     FROM member_livestreams WHERE email = $1`, [profile.rows[0].email]
  );

  const accounts = streams.rows.map(s => ({
    platform: s.platform,
    handle: s.title || null,
    url: s.stream_url || null,
    display_name: s.channel_name || s.platform,
    stream_url: s.stream_url,
    status: s.status,
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

module.exports = {
  getProfileByEmail, getProfileByUsername, upsertProfile,
  getPublicDirectory, getPublicProfileByUsername,
  setMustChangePassword, getMustChangePassword,
  getProfileEmailByUsername,
  hasCreatorTools, MEMBERS_WITH_PERMS,
};