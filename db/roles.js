// db/roles.js — Roles and permissions system keyed to auth_users.id.
// Owns: roles, permissions, role_permissions, user_roles tables.
// Does NOT own: org_roles/org_permissions (email-based legacy system).
const { pool } = require('./index');

const SUPERADMIN_EMAIL = 'stotteyman@gmail.com';

// ── Roles ──────────────────────────────────────────────────────────────────────

/** Get all roles. */
async function getAllRoles() {
  const result = await pool.query(
    'SELECT id, name, display_name, description, priority, is_system, created_at FROM roles ORDER BY priority DESC, id'
  );
  return result.rows;
}

/** Get role by name. */
async function getRoleByName(name) {
  const result = await pool.query(
    'SELECT id, name, display_name, description, priority, is_system FROM roles WHERE name = $1', [name]
  );
  return result.rows[0] || null;
}

/** Get role by ID. */
async function getRoleById(id) {
  const result = await pool.query(
    'SELECT id, name, display_name, description, priority, is_system FROM roles WHERE id = $1', [id]
  );
  return result.rows[0] || null;
}

/** Create a new role. */
async function createRole({ name, display_name, description, priority = 0, is_system = false }) {
  const result = await pool.query(
    `INSERT INTO roles (name, display_name, description, priority, is_system)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, display_name, description, priority, is_system`,
    [name, display_name, description || '', priority, is_system]
  );
  return result.rows[0];
}

/** Update a role (display_name, description, priority). */
async function updateRole(id, { display_name, description, priority }) {
  const result = await pool.query(
    `UPDATE roles SET
       display_name = COALESCE($2, display_name),
       description  = COALESCE($3, description),
       priority     = COALESCE($4, priority)
     WHERE id = $1
     RETURNING id, name, display_name, description, priority, is_system`,
    [id, display_name, description, priority]
  );
  return result.rows[0] || null;
}

/** Delete a role (only non-system roles). */
async function deleteRole(id) {
  const result = await pool.query(
    'DELETE FROM roles WHERE id = $1 AND is_system = false RETURNING id',
    [id]
  );
  return result.rowCount > 0;
}

// ── Permissions ────────────────────────────────────────────────────────────────

/** Get all permissions grouped by category. */
async function getAllPermissions() {
  const result = await pool.query(
    'SELECT id, key, category, description FROM permissions ORDER BY category, key'
  );
  return result.rows;
}

/** Get permissions for a role. */
async function getPermissionsForRole(roleName) {
  const result = await pool.query(
    `SELECT p.key FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = (SELECT id FROM roles WHERE name = $1)`,
    [roleName]
  );
  return result.rows.map(r => r.key);
}

/** Get all permissions with their role assignments. */
async function getRolePermissions() {
  const result = await pool.query(
    `SELECT r.id as role_id, r.name as role, p.id as permission_id, p.key as permission_key, p.category, p.description
     FROM role_permissions rp
     JOIN roles r ON r.id = rp.role_id
     JOIN permissions p ON p.id = rp.permission_id
     ORDER BY r.priority DESC, r.id, p.category, p.key`
  );
  return result.rows;
}

/** Grant a permission to a role. */
async function grantPermissionToRole(roleId, permissionId) {
  await pool.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [roleId, permissionId]
  );
}

/** Revoke a permission from a role. */
async function revokePermissionFromRole(roleId, permissionId) {
  await pool.query(
    'DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2',
    [roleId, permissionId]
  );
}

/** Grant all permissions to a role. */
async function grantAllPermissionsToRole(roleId) {
  await pool.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT $1, id FROM permissions
     ON CONFLICT DO NOTHING`,
    [roleId]
  );
}

/** Revoke all permissions from a role. */
async function revokeAllPermissionsFromRole(roleId) {
  await pool.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
}

// ── User roles ─────────────────────────────────────────────────────────────────

/** Get all roles for a user (by auth_users.id). */
async function getUserRoles(userId) {
  const result = await pool.query(
    `SELECT r.id, r.name, r.description, r.is_system, ur.assigned_at
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1
     ORDER BY r.id`,
    [userId]
  );
  return result.rows;
}

/** Get all permission keys for a user. */
async function getUserPermissions(userId) {
  const result = await pool.query(
    `SELECT DISTINCT p.key
     FROM user_roles ur
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = $1`,
    [userId]
  );
  return result.rows.map(r => r.key);
}

/** Assign a role to a user. */
async function assignRoleToUser(userId, roleId, assignedBy = null) {
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id, assigned_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId, roleId, assignedBy]
  );
}

/** Remove a role from a user. */
async function removeRoleFromUser(userId, roleId) {
  await pool.query(
    'DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2',
    [userId, roleId]
  );
}

/** Get all users with their roles and permissions (for admin panel). */
async function getUsersWithRoles(limit = 200) {
  const result = await pool.query(
    `SELECT
       au.id, au.email, au.display_name, au.avatar_url, au.is_suspended, au.created_at,
       COALESCE(
         (SELECT json_agg(json_build_object('id', r.id, 'name', r.name, 'description', r.description, 'is_system', r.is_system))
          FROM user_roles ur JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = au.id),
         '[]'
       ) as roles,
       COALESCE(
         (SELECT array_agg(DISTINCT p.key)
          FROM user_roles ur
          JOIN role_permissions rp ON rp.role_id = ur.role_id
          JOIN permissions p ON p.id = rp.permission_id
          WHERE ur.user_id = au.id),
         '{}'
       ) as permissions
     FROM auth_users au
     ORDER BY au.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/** Check if a user has a specific role (by email, for middleware use). */
async function userHasRole(userId, roleName) {
  const result = await pool.query(
    `SELECT 1 FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1 AND r.name = $2
     LIMIT 1`,
    [userId, roleName]
  );
  return result.rows.length > 0;
}

/** Check if a user has a specific permission key (by email, for middleware use). */
async function userHasPermission(userId, permissionKey) {
  const result = await pool.query(
    `SELECT 1 FROM user_roles ur
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = $1 AND p.key = $2
     LIMIT 1`,
    [userId, permissionKey]
  );
  return result.rows.length > 0;
}

/** Get user access object: { roles: [], permissions: [] } */
async function getUserAccess(userId) {
  // Owner email always gets SUPER_ADMIN
  const userResult = await pool.query(
    'SELECT email FROM auth_users WHERE id = $1', [userId]
  );
  const email = userResult.rows[0]?.email || '';

  let roles = await getUserRoles(userId);
  let permissions = await getUserPermissions(userId);

  if (email.toLowerCase() === SUPERADMIN_EMAIL) {
    // Ensure SUPER_ADMIN role is present
    const hasSuperadmin = roles.some(r => r.name === 'SUPER_ADMIN');
    if (!hasSuperadmin) {
      const saRole = await getRoleByName('SUPER_ADMIN');
      if (saRole) {
        await assignRoleToUser(userId, saRole.id);
        roles = await getUserRoles(userId);
        permissions = await getUserPermissions(userId);
      }
    }
  }

  return {
    roles: roles.map(r => r.name),
    permissions,
    isSuperadmin: roles.some(r => r.name === 'SUPER_ADMIN'),
  };
}

/** Revoke all roles from a user (used during ban). */
async function revokeAllRoles(userId) {
  await pool.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
}

module.exports = {
  SUPERADMIN_EMAIL,
  getAllRoles, getRoleByName, getRoleById, createRole, updateRole, deleteRole,
  getAllPermissions, getPermissionsForRole, getRolePermissions,
  grantPermissionToRole, revokePermissionFromRole,
  grantAllPermissionsToRole, revokeAllPermissionsFromRole,
  getUserRoles, getUserPermissions, assignRoleToUser, removeRoleFromUser,
  getUsersWithRoles, userHasRole, userHasPermission, getUserAccess, revokeAllRoles,
};