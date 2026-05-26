// routes/api/admin-users.js — Admin user management (roles, bans).
const express = require('express');
const router = express.Router();
const { pool } = require('../../db/index');
const { getMemberAccess, canManageRole, setMemberRole, banMember, unbanMember, ORG_ROLES } = require('../../db/orgAccess');

function requireAdmin(req, res, next) {
  const email = req.session?.userEmail;
  if (!email) return res.status(401).json({ error: 'Not authenticated' });
  getMemberAccess(email).then(access => {
    if (access.role === 'banned') return res.status(403).json({ error: 'Banned' });
    if (access.role === 'superadmin' || access.role === 'admin') return next();
    return res.status(403).json({ error: 'Admin access required' });
  }).catch(() => res.status(500).json({ error: 'Auth check failed' }));
}

// GET /api/admin/users — list all members
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT mp.email, mp.username, mp.display_name, mp.avatar_url, mp.role, mp.created_at,
              COALESCE(our.role, mp.role) as effective_role,
              br.banned_by, br.ban_reason, br.banned_until
       FROM member_profiles mp
       LEFT JOIN org_user_roles our ON our.email = mp.email
       LEFT JOIN org_ban_records br ON br.email = mp.email
       ORDER BY mp.created_at DESC LIMIT 200`
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// PUT /api/admin/users/:email/role — change member role
router.put('/users/:email/role', requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!ORG_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const targetEmail = req.params.email.toLowerCase();
    const adminEmail = req.session.userEmail;
    const adminAccess = await getMemberAccess(adminEmail);

    // Admin can't promote above their rank (except superadmin)
    if (adminAccess.role !== 'superadmin' && !canManageRole(adminAccess.role, role)) {
      return res.status(403).json({ error: 'Cannot assign this role' });
    }

    await setMemberRole(targetEmail, role, adminEmail);
    res.json({ ok: true, role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// POST /api/admin/users/:email/ban — ban a member
router.post('/users/:email/ban', requireAdmin, async (req, res) => {
  try {
    const { reason, bannedUntil } = req.body;
    const targetEmail = req.params.email.toLowerCase();
    const adminEmail = req.session.userEmail;
    await banMember(targetEmail, adminEmail, reason || 'Policy violation', bannedUntil || null);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to ban member' });
  }
});

// POST /api/admin/users/:email/unban — unban a member
router.post('/users/:email/unban', requireAdmin, async (req, res) => {
  try {
    await unbanMember(req.params.email.toLowerCase());
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to unban member' });
  }
});

module.exports = router;