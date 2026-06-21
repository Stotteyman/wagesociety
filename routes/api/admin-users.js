// routes/api/admin-users.js — Admin user management.
// Uses new roles system (auth_users.id keyed) via req.user from loadUserPermissions middleware.
// Does NOT own: session management (server.js), old orgAccess (db/orgAccess.js).
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { listAllUsers, getUserWithMembership } = require('../../db/adminUsers');
const { getAllRoles, assignRoleToUser, removeRoleFromUser, getRoleByName } = require('../../db/roles');
const { setAdminResetToken, setUserPassword, setUserSuspended } = require('../../db/users');

const APP_URL = process.env.APP_URL || 'https://wagesociety.com';

// ── Permission guard: users.manage (or SUPER_ADMIN with owner email fallback) ─
function requireUsersManage(req, res, next) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  // New roles system: loadUserPermissions sets req.user.isSuperadmin + req.user.permissions
  if (req.user?.isSuperadmin || req.user?.permissions?.includes('users.manage')) {
    console.log(`[admin-users auth] allowed via new-system: userId=${userId}, isSuperadmin=${req.user.isSuperadmin}, perms=${req.user.permissions}`);
    return next();
  }

  // Fallback: check owner email is in SUPERADMIN list (guards against loadUserPermissions
  // not running for certain auth paths that still set session.userId)
  const { SUPERADMIN_EMAILS } = require('../../lib/auth');
  const email = req.session.userEmail?.toLowerCase();
  if (SUPERADMIN_EMAILS.has(email)) {
    console.log(`[admin-users auth] allowed via owner fallback: ${email}`);
    return next();
  }

  console.warn(`[admin-users auth] denied — userId=${userId}, email=${email}, req.user=${JSON.stringify(req.user)}`);
  return res.status(403).json({ error: 'users.manage permission required' });
}

// GET /api/admin/users — list all users with membership status
router.get('/', requireUsersManage, async (req, res) => {
  try {
    const users = await listAllUsers(200);
    res.json({ users });
  } catch (err) {
    console.error('[admin-users GET /users]', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// GET /api/admin/users/:email — single user detail with membership
router.get('/:email', requireUsersManage, async (req, res) => {
  try {
    const user = await getUserWithMembership(req.params.email);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    console.error('[admin-users GET /users/:email]', err);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

// PUT /api/admin/users/:email/role — assign a role via new roles system
// Accepts { roleId: 2 } OR { role: "ADMIN" } (role name)
// Only SUPER_ADMIN can assign SUPER_ADMIN; ADMIN can assign other roles.
router.put('/:email/role', requireUsersManage, async (req, res) => {
  try {
    const { roleId, role: roleName } = req.body;
    const targetEmail = req.params.email.toLowerCase();
    const { pool } = require('../../db/index');

    // Resolve role by ID or name
    let role;
    if (roleId) {
      const roleRow = await pool.query(
        'SELECT id, name FROM roles WHERE id = $1', [parseInt(roleId, 10)]
      );
      if (!roleRow.rows[0]) return res.status(400).json({ error: 'Role not found' });
      role = roleRow.rows[0];
    } else if (roleName) {
      const roleRow = await pool.query(
        'SELECT id, name FROM roles WHERE name = $1', [roleName.toUpperCase()]
      );
      if (!roleRow.rows[0]) return res.status(400).json({ error: 'Role not found' });
      role = roleRow.rows[0];
    } else {
      return res.status(400).json({ error: 'roleId or role required' });
    }

    // Only SUPER_ADMIN can assign SUPER_ADMIN
    if (role.name === 'SUPER_ADMIN' && !req.user?.isSuperadmin) {
      return res.status(403).json({ error: 'Only SUPER_ADMIN can assign that role' });
    }

    // Look up target user by email
    const userRow = await pool.query(
      'SELECT id FROM auth_users WHERE email = $1', [targetEmail]
    );
    if (!userRow.rows[0]) return res.status(404).json({ error: 'User not found' });
    const targetUserId = userRow.rows[0].id;

    await assignRoleToUser(targetUserId, role.id, req.session.userId);
    // Sync Discord staff role after assignment (non-blocking)
    const { syncRoles } = require('../../lib/discord-sync');
    syncRoles(targetUserId).catch(err => console.log(`[admin-users] Discord sync failed after role change: ${err.message}`));
    res.json({ ok: true, role: role.name });
  } catch (err) {
    console.error('[admin-users PUT /role]', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// POST /api/admin/users/:email/ban — ban a member (suspend)
router.post('/:email/ban', requireUsersManage, async (req, res) => {
  try {
    const targetEmail = req.params.email.toLowerCase();
    await setUserSuspended(targetEmail, true);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin-users POST /ban]', err);
    res.status(500).json({ error: 'Failed to ban member' });
  }
});

// POST /api/admin/users/:email/unban — unban a member
router.post('/:email/unban', requireUsersManage, async (req, res) => {
  try {
    await setUserSuspended(req.params.email.toLowerCase(), false);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin-users POST /unban]', err);
    res.status(500).json({ error: 'Failed to unban member' });
  }
});

// POST /api/admin/users/:email/send-reset-link — admin-initiated magic link reset
router.post('/:email/send-reset-link', requireUsersManage, async (req, res) => {
  try {
    const targetEmail = req.params.email.toLowerCase();
    const token = crypto.randomBytes(32).toString('hex');
    await setAdminResetToken(targetEmail, token);

    const resetUrl = `${APP_URL}/auth/reset-password?token=${token}`;

    if (process.env.ZOHO_SMTP_USER && process.env.ZOHO_SMTP_PASS) {
      const transport = nodemailer.createTransport({
        host: process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com',
        port: Number(process.env.ZOHO_SMTP_PORT) || 465,
        secure: true,
        auth: {
          user: process.env.ZOHO_SMTP_USER,
          pass: process.env.ZOHO_SMTP_PASS,
        },
      });
      await transport.sendMail({
        from: '"W.A.G.E. Society" <hello@wagesociety.com>',
        to: targetEmail,
        subject: 'Reset your WAGE Society password',
        text: `An admin has requested a password reset for your account.\n\nClick to set a new password: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not expect this, please contact us.`,
        html: `<p>An admin has requested a password reset for your WAGE Society account.</p>
<p><a href="${resetUrl}">Click here to set a new password</a></p>
<p style="font-size:0.85rem;color:#666">This link expires in 1 hour.<br>If you did not expect this, please contact us.</p>`,
      });
      console.log(`[admin-users] Password reset email sent to ${targetEmail}`);
    } else {
      console.log(`[admin-users] No mail transport — reset link: ${resetUrl}`);
    }

    res.json({ ok: true, message: 'Reset link sent' });
  } catch (err) {
    console.error('[admin-users POST /send-reset-link]', err);
    res.status(500).json({ error: 'Failed to send reset link' });
  }
});

// POST /api/admin/users/:email/set-password — admin sets password directly
router.post('/:email/set-password', requireUsersManage, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const targetEmail = req.params.email.toLowerCase();
    const passwordHash = await bcrypt.hash(password, 12);
    await setUserPassword(targetEmail, passwordHash);
    console.log(`[admin-users] Password directly set for ${targetEmail}`);
    res.json({ ok: true, message: 'Password updated' });
  } catch (err) {
    console.error('[admin-users POST /set-password]', err);
    res.status(500).json({ error: 'Failed to set password' });
  }
});

// POST /api/admin/users/:email/suspend — suspend account
router.post('/:email/suspend', requireUsersManage, async (req, res) => {
  try {
    const targetEmail = req.params.email.toLowerCase();
    await setUserSuspended(targetEmail, true);
    res.json({ ok: true, message: 'Account suspended' });
  } catch (err) {
    console.error('[admin-users POST /suspend]', err);
    res.status(500).json({ error: 'Failed to suspend account' });
  }
});

// POST /api/admin/users/:email/unsuspend — lift suspension
router.post('/:email/unsuspend', requireUsersManage, async (req, res) => {
  try {
    const targetEmail = req.params.email.toLowerCase();
    await setUserSuspended(targetEmail, false);
    res.json({ ok: true, message: 'Account restored' });
  } catch (err) {
    console.error('[admin-users POST /unsuspend]', err);
    res.status(500).json({ error: 'Failed to restore account' });
  }
});

// PUT /api/admin/users/:email/tier — change user's subscription tier
router.put('/:email/tier', requireUsersManage, async (req, res) => {
  try {
    const { tier, reason } = req.body;
    const VALID_TIERS = ['free', 'creator', 'pro', 'elite', 'unlimited'];
    if (!tier || !VALID_TIERS.includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier. Must be one of: ' + VALID_TIERS.join(', ') });
    }
    const targetEmail = req.params.email.toLowerCase();
    const adminEmail = req.session.userEmail || 'admin';

    const { pool } = require('../../db/index');

    // Get current tier
    const { rows: before } = await pool.query(
      'SELECT tier FROM auth_users WHERE email = $1', [targetEmail]
    );
    const previousTier = before[0]?.tier || 'free';

    // Update auth_users.tier
    await pool.query('UPDATE auth_users SET tier = $1 WHERE email = $2', [tier, targetEmail]);

    // Also update user_memberships status if changing to/from free
    if (tier === 'free') {
      await pool.query(
        `UPDATE user_memberships SET status = 'canceled' WHERE email = $1 AND status IN ('active','trialing')`,
        [targetEmail]
      );
    } else {
      // Deactivate ALL existing active/trialing memberships first — prevents old tier
      // row (e.g. 'creator') from coexisting with the new tier row and causing
      // getUserMembership() to pick the wrong one (highest sort_order wins, but
      // switching from higher→lower sort_order would show stale tier on Settings/Directory).
      await pool.query(
        `UPDATE user_memberships SET status = 'canceled' WHERE email = $1 AND status IN ('active','trialing')`,
        [targetEmail]
      );
      // Upsert membership record for the new tier
      const { rows: planRows } = await pool.query(
        'SELECT slug FROM membership_plans WHERE slug = $1', [tier]
      );
      if (planRows.length > 0) {
        const existing = await pool.query(
          'SELECT id FROM user_memberships WHERE email = $1 AND plan_slug = $2',
          [targetEmail, tier]
        );
        if (existing.rows.length === 0) {
          await pool.query(
            `INSERT INTO user_memberships (email, plan_slug, status, current_period_start, current_period_end)
             VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '1 month')`,
            [targetEmail, tier]
          );
        } else {
          await pool.query(
            `UPDATE user_memberships SET status = 'active', current_period_end = NOW() + INTERVAL '1 month' WHERE email = $1 AND plan_slug = $2`,
            [targetEmail, tier]
          );
        }
      }
    }

    // Log audit
    const { logTierChange } = require('../../db/admin');
    await logTierChange({ adminEmail, targetEmail, previousTier, newTier: tier, ip: req.ip });

    // Trigger Discord role sync
    const { syncRoles } = require('../../lib/discord-sync');
    const { rows: userRow } = await pool.query('SELECT id FROM auth_users WHERE email = $1', [targetEmail]);
    if (userRow[0]) {
      syncRoles(userRow[0].id).catch(err => console.log(`[admin-users] Discord sync failed after tier change: ${err.message}`));
    }

    res.json({ ok: true, previousTier, newTier: tier });
  } catch (err) {
    console.error('[admin-users PUT /tier]', err);
    res.status(500).json({ error: 'Failed to update tier' });
  }
});

// POST /api/admin/users/bulk-tier-change — bulk tier change for multiple users
router.post('/bulk-tier-change', requireUsersManage, async (req, res) => {
  try {
    const { emails, tier } = req.body;
    const VALID_TIERS = ['free', 'creator', 'pro', 'elite', 'unlimited'];
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'emails array required' });
    }
    if (!tier || !VALID_TIERS.includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier' });
    }
    const adminEmail = req.session.userEmail || 'admin';

    const { pool } = require('../../db/index');

    // Get previous tier for audit
    const { rows: users } = await pool.query(
      'SELECT id, email, tier FROM auth_users WHERE LOWER(email) = ANY($1::text[])',
      [emails.map(e => e.toLowerCase())]
    );
    const previousTier = users[0]?.tier || 'free';

    // Bulk update
    await pool.query(
      'UPDATE auth_users SET tier = $1 WHERE LOWER(email) = ANY($2::text[])',
      [tier, emails.map(e => e.toLowerCase())]
    );

    if (tier === 'free') {
      await pool.query(
        `UPDATE user_memberships SET status = 'canceled' WHERE LOWER(email) = ANY($1::text[]) AND status IN ('active','trialing')`,
        [emails.map(e => e.toLowerCase())]
      );
    } else {
      // Deactivate all active/trialing memberships for all affected users first,
      // then create a new active row for each user for the new tier.
      await pool.query(
        `UPDATE user_memberships SET status = 'canceled' WHERE LOWER(email) = ANY($1::text[]) AND status IN ('active','trialing')`,
        [emails.map(e => e.toLowerCase())]
      );
      const emailsLower = emails.map(e => e.toLowerCase());
      const { rows: planRows } = await pool.query(
        'SELECT slug FROM membership_plans WHERE slug = $1', [tier]
      );
      if (planRows.length > 0) {
        // Insert active membership for each user in the batch
        for (const userEmail of emailsLower) {
          const existing = await pool.query(
            'SELECT id FROM user_memberships WHERE email = $1 AND plan_slug = $2',
            [userEmail, tier]
          );
          if (existing.rows.length === 0) {
            await pool.query(
              `INSERT INTO user_memberships (email, plan_slug, status, current_period_start, current_period_end)
               VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '1 month')`,
              [userEmail, tier]
            );
          } else {
            await pool.query(
              `UPDATE user_memberships SET status = 'active', current_period_end = NOW() + INTERVAL '1 month' WHERE email = $1 AND plan_slug = $2`,
              [userEmail, tier]
            );
          }
        }
      }
    }

    // Log audit
    const { logBulkTierChange } = require('../../db/admin');
    await logBulkTierChange({
      adminEmail, emails, previousTier, newTier: tier, count: users.length, ip: req.ip,
    });

    // Trigger Discord sync for all affected users (non-blocking)
    const { syncRoles } = require('../../lib/discord-sync');
    users.forEach(u => {
      syncRoles(u.id).catch(() => {});
    });

    res.json({ ok: true, updated: users.length, newTier: tier });
  } catch (err) {
    console.error('[admin-users POST /bulk-tier-change]', err);
    res.status(500).json({ error: 'Failed to bulk update tiers' });
  }
});

// DELETE /api/admin/users/:email — delete user account (cascading cleanup)
router.delete('/:email', requireUsersManage, async (req, res) => {
  try {
    const targetEmail = req.params.email.toLowerCase();
    // Prevent self-deletion
    if (req.session.userEmail?.toLowerCase() === targetEmail) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    const { pool } = require('../../db/index');

    // Get user ID
    const userRow = await pool.query('SELECT id FROM auth_users WHERE email = $1', [targetEmail]);
    if (!userRow.rows[0]) return res.status(404).json({ error: 'User not found' });
    const targetUserId = userRow.rows[0].id;

    // Cascading cleanup (ignore errors per table — some may not exist)
    const cleanup = async (table, condition) => {
      try { await pool.query(`DELETE FROM ${table} WHERE ${condition}`, [targetUserId, targetEmail]); } catch (_) {}
    };

    await Promise.all([
      cleanup('point_transactions', 'user_id = $1'),
      cleanup('referrals', 'referrer_id = $1 OR referred_user_id = $1'),
      cleanup('shop_purchases', 'user_id = $1'),
      cleanup('oauth_connections', 'user_id = $1'),
      cleanup('discord_links', 'user_id = $1'),
      cleanup('user_roles', 'user_id = $1'),
      cleanup('user_memberships', 'email = $2'),
      pool.query('DELETE FROM member_profiles WHERE email = $2').catch(_ => {}),
      pool.query('DELETE FROM blog_posts WHERE author_email = $2').catch(_ => {}),
    ]);

    // Log admin action before deletion
    const { logAdminAction } = require('../../db/admin');
    await logAdminAction(req.session.userId, 'user_delete', { deleted_email: targetEmail }).catch(() => {});

    // Delete auth_users record last
    await pool.query('DELETE FROM auth_users WHERE id = $1', [targetUserId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin-users DELETE]', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;