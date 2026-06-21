// routes/api/admin-roles.js — Admin roles and permissions management.
// Owns: GET/POST/PUT/DELETE roles, permission grid, assign/revoke user roles.
// Does NOT own: auth (server.js), old org_roles system (db/orgAccess.js).
const express = require('express');
const router = express.Router();
const {
  getAllRoles,
  getAllPermissions,
  getRolePermissions,
  getUsersWithRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  grantPermissionToRole,
  revokePermissionFromRole,
  grantAllPermissionsToRole,
  revokeAllPermissionsFromRole,
  assignRoleToUser,
  removeRoleFromUser,
} = require('../../db/roles');

// Guard: require users.manage permission or superadmin
function requireAdmin(req, res, next) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  if (req.user?.isSuperadmin || req.user?.permissions?.includes('users.manage')) return next();
  return res.status(403).json({ error: 'users.manage permission required' });
}

// Guard: require superadmin only (for roles management)
function requireSuperadmin(req, res, next) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  if (req.user?.isSuperadmin) return next();
  return res.status(403).json({ error: 'Superadmin role required' });
}

// GET /api/admin/roles — all roles with their permissions
router.get('/', requireAdmin, async (req, res) => {
  try {
    const roles = await getAllRoles();
    const rolePerms = await getRolePermissions();
    const permMap = {};
    rolePerms.forEach(rp => {
      if (!permMap[rp.role]) permMap[rp.role] = [];
      permMap[rp.role].push(rp.permission_key);
    });
    const rolesWithPerms = roles.map(r => ({
      ...r,
      permissions: permMap[r.name] || [],
    }));
    res.json({ roles: rolesWithPerms });
  } catch (err) {
    console.error('[admin-roles GET /]', err);
    res.status(500).json({ error: 'Failed to load roles' });
  }
});

// GET /api/admin/roles/permissions — all permissions
router.get('/permissions', requireAdmin, async (req, res) => {
  try {
    const permissions = await getAllPermissions();
    res.json({ permissions });
  } catch (err) {
    console.error('[admin-roles GET /permissions]', err);
    res.status(500).json({ error: 'Failed to load permissions' });
  }
});

// GET /api/admin/roles/users — all users with roles and permissions
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await getUsersWithRoles(200);
    res.json({ users });
  } catch (err) {
    console.error('[admin-roles GET /users]', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// POST /api/admin/roles/users/:userId/assign — assign a role to a user
router.post('/users/:userId/assign', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { roleId } = req.body;
    if (!userId || !roleId) return res.status(400).json({ error: 'userId and roleId required' });

    const role = await getRoleById(parseInt(roleId, 10));
    if (!role) return res.status(404).json({ error: 'Role not found' });

    // Only superadmins can assign superadmin role
    if (role.name === 'SUPER_ADMIN' && !req.user?.isSuperadmin) {
      return res.status(403).json({ error: 'Only superadmins can assign SUPER_ADMIN role' });
    }

    await assignRoleToUser(userId, role.id, req.session.userId);
    // Sync Discord staff role after assignment (non-blocking)
    const { syncRoles } = require('../../lib/discord-sync');
    syncRoles(userId).catch(err => console.log(`[admin-roles] Discord sync failed after assign: ${err.message}`));
    res.json({ ok: true, message: `Role '${role.name}' assigned` });
  } catch (err) {
    console.error('[admin-roles POST /assign]', err);
    res.status(500).json({ error: 'Failed to assign role' });
  }
});

// DELETE /api/admin/roles/users/:userId/revoke/:roleId — remove a role from a user
router.delete('/users/:userId/revoke/:roleId', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const roleId = parseInt(req.params.roleId, 10);
    if (!userId || !roleId) return res.status(400).json({ error: 'userId and roleId required' });

    const role = await getRoleById(roleId);
    if (!role) return res.status(404).json({ error: 'Role not found' });

    // Prevent removing superadmin from the owner (SUPERADMIN_EMAIL env var, no hardcoded address)
    const ownerEmail = (process.env.SUPERADMIN_EMAIL || '').toLowerCase();
    if (ownerEmail && role.name === 'SUPER_ADMIN') {
      const { pool } = require('../../db/index');
      const userRow = await pool.query('SELECT email FROM auth_users WHERE id = $1', [userId]);
      if (userRow.rows[0]?.email?.toLowerCase() === ownerEmail) {
        return res.status(403).json({ error: 'Cannot remove superadmin from owner account' });
      }
    }

    await removeRoleFromUser(userId, roleId);
    res.json({ ok: true, message: `Role '${role.name}' removed` });
  } catch (err) {
    console.error('[admin-roles DELETE /revoke]', err);
    res.status(500).json({ error: 'Failed to remove role' });
  }
});

// ── Role CRUD ─────────────────────────────────────────────────────────────────

// POST /api/admin/roles — create a new role
router.post('/', requireSuperadmin, async (req, res) => {
  try {
    const { name, display_name, description, priority } = req.body;
    if (!name || !display_name) {
      return res.status(400).json({ error: 'name and display_name are required' });
    }
    // Name must be UPPER_SNAKE_CASE
    const normalizedName = name.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const existing = await getRoleByName(normalizedName);
    if (existing) return res.status(409).json({ error: `Role '${normalizedName}' already exists` });

    const role = await createRole({
      name: normalizedName,
      display_name,
      description: description || '',
      priority: parseInt(priority, 10) || 0,
      is_system: false,
    });
    res.json({ ok: true, role });
  } catch (err) {
    console.error('[admin-roles POST /]', err);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

// PUT /api/admin/roles/:id — update a role
router.put('/:id', requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const role = await getRoleById(id);
    if (!role) return res.status(404).json({ error: 'Role not found' });

    // System roles: cannot change name
    const updated = await updateRole(id, {
      display_name: req.body.display_name,
      description: req.body.description,
      priority: req.body.priority != null ? parseInt(req.body.priority, 10) : undefined,
    });
    res.json({ ok: true, role: updated });
  } catch (err) {
    console.error('[admin-roles PUT /:id]', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// DELETE /api/admin/roles/:id — delete a role (only non-system)
router.delete('/:id', requireSuperadmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const role = await getRoleById(id);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (role.is_system) return res.status(400).json({ error: 'Cannot delete system roles' });

    const deleted = await deleteRole(id);
    if (!deleted) return res.status(400).json({ error: 'Cannot delete system role' });
    res.json({ ok: true, message: `Role '${role.name}' deleted` });
  } catch (err) {
    console.error('[admin-roles DELETE /:id]', err);
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

// ── Permission management ─────────────────────────────────────────────────────

// POST /api/admin/roles/:roleId/permissions/:permId — grant a permission
router.post('/:roleId/permissions/:permId', requireSuperadmin, async (req, res) => {
  try {
    const roleId = parseInt(req.params.roleId, 10);
    const permId = parseInt(req.params.permId, 10);
    await grantPermissionToRole(roleId, permId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin-roles POST permissions]', err);
    res.status(500).json({ error: 'Failed to grant permission' });
  }
});

// DELETE /api/admin/roles/:roleId/permissions/:permId — revoke a permission
router.delete('/:roleId/permissions/:permId', requireSuperadmin, async (req, res) => {
  try {
    const roleId = parseInt(req.params.roleId, 10);
    const permId = parseInt(req.params.permId, 10);
    await revokePermissionFromRole(roleId, permId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin-roles DELETE permissions]', err);
    res.status(500).json({ error: 'Failed to revoke permission' });
  }
});

// POST /api/admin/roles/:roleId/grant-all — grant all permissions to a role
router.post('/:roleId/grant-all', requireSuperadmin, async (req, res) => {
  try {
    const roleId = parseInt(req.params.roleId, 10);
    await grantAllPermissionsToRole(roleId);
    res.json({ ok: true, message: 'All permissions granted' });
  } catch (err) {
    console.error('[admin-roles POST grant-all]', err);
    res.status(500).json({ error: 'Failed to grant all permissions' });
  }
});

// POST /api/admin/roles/:roleId/revoke-all — revoke all permissions from a role
router.post('/:roleId/revoke-all', requireSuperadmin, async (req, res) => {
  try {
    const roleId = parseInt(req.params.roleId, 10);
    await revokeAllPermissionsFromRole(roleId);
    res.json({ ok: true, message: 'All permissions revoked' });
  } catch (err) {
    console.error('[admin-roles POST revoke-all]', err);
    res.status(500).json({ error: 'Failed to revoke all permissions' });
  }
});

module.exports = router;