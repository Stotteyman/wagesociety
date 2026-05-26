// db/orgAccess.js — Org roles, permissions, and access control.
// Mirrors src/lib/orgAccess.ts + src/lib/orgAuth.ts from wagesociety2.0
const { pool } = require('./index');

const ORG_ROLES = ['superadmin','admin','manager','staff','moderator','helper','user','banned'];
const ORG_ROLE_RANK = {
  superadmin: 0, admin: 1, manager: 2, staff: 3,
  moderator: 4, helper: 5, user: 6, banned: 7,
};
const ORG_ROLE_LABELS = {
  superadmin: 'Superadmin', admin: 'Admin', manager: 'Manager',
  staff: 'Staff', moderator: 'Moderator', helper: 'Helper',
  user: 'User', banned: 'Banned',
};
const OWNER_SUPERADMIN_EMAILS = new Set(['stotteyman@gmail.com']);

function isOrgRole(value) {
  return ORG_ROLES.includes(value);
}

function canManageRole(actorRole, targetRole) {
  if (actorRole === 'superadmin') return true;
  if (actorRole === 'banned') return false;
  return (ORG_ROLE_RANK[actorRole] || 99) < (ORG_ROLE_RANK[targetRole] || 0);
}

function formatRoleLabel(role) {
  return ORG_ROLE_LABELS[role] || role;
}

async function getMemberRole(email) {
  // Owner email always gets superadmin
  if (OWNER_SUPERADMIN_EMAILS.has(email.toLowerCase())) return 'superadmin';

  // Check explicit override
  const override = await pool.query(
    'SELECT role FROM org_user_roles WHERE email = $1', [email.toLowerCase()]
  );
  if (override.rows[0]) return override.rows[0].role;

  // Fall back to profile role
  const profile = await pool.query(
    'SELECT role FROM member_profiles WHERE email = $1', [email.toLowerCase()]
  );
  if (profile.rows[0]?.role && isOrgRole(profile.rows[0].role)) {
    return profile.rows[0].role;
  }
  return 'user';
}

async function getRolePermissions(role) {
  if (role === 'banned') return [];

  const result = await pool.query(
    `SELECT p.permission_key FROM org_role_permissions rp
     JOIN org_permissions p ON p.permission_key = rp.permission_key
     WHERE rp.role_name = $1`, [role]
  );
  return result.rows.map(r => r.permission_key);
}

async function getBanRecord(email) {
  const result = await pool.query(
    'SELECT banned_by, ban_reason, banned_until FROM org_ban_records WHERE email = $1',
    [email.toLowerCase()]
  );
  return result.rows[0] || null;
}

async function getMemberAccess(email) {
  const role = await getMemberRole(email);
  const permissions = await getRolePermissions(role);
  const ban = role === 'banned' ? await getBanRecord(email) : null;

  return {
    role,
    actorRole: role,
    viewingAs: null,
    permissions,
    isSuperadmin: role === 'superadmin',
    ban,
  };
}

async function setMemberRole(email, role, grantedBy) {
  if (!isOrgRole(role)) throw new Error('Invalid role: ' + role);
  await pool.query(
    `INSERT INTO org_user_roles (email, role, granted_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET role = $2, granted_by = $3`,
    [email.toLowerCase(), role, grantedBy]
  );
}

async function banMember(email, bannedBy, reason, bannedUntil) {
  await pool.query(
    `INSERT INTO org_ban_records (email, banned_by, ban_reason, banned_until)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET banned_by = $2, ban_reason = $3, banned_until = $4`,
    [email.toLowerCase(), bannedBy, reason, bannedUntil]
  );
  // Set role to banned
  await pool.query(
    `INSERT INTO org_user_roles (email, role)
     VALUES ($1, 'banned')
     ON CONFLICT (email) DO UPDATE SET role = 'banned'`,
    [email.toLowerCase()]
  );
}

async function unbanMember(email) {
  await pool.query('DELETE FROM org_ban_records WHERE email = $1', [email.toLowerCase()]);
  await pool.query(
    `DELETE FROM org_user_roles WHERE email = $1 AND role = 'banned'`,
    [email.toLowerCase()]
  );
}

module.exports = {
  ORG_ROLES, ORG_ROLE_RANK, ORG_ROLE_LABELS, OWNER_SUPERADMIN_EMAILS,
  isOrgRole, canManageRole, formatRoleLabel,
  getMemberRole, getRolePermissions, getBanRecord, getMemberAccess,
  setMemberRole, banMember, unbanMember,
};