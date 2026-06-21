// routes/api/admin-referrals.js — Admin referral attribution API.
// Auth: requires users.manage permission or SUPERADMIN email fallback.
const express = require('express');
const router = express.Router();
const {
  getAttributionByReferee,
  getUserById,
  searchUsers,
  getReferrerByCode,
  createAttribution,
  deleteAttribution,
  getAttributionHistory,
  getReferralOverview,
  REFERRER_POINTS,
  REFEREE_POINTS,
} = require('../../db/admin-referrals');

// ── Permission guard ──────────────────────────────────────────────────────────
function requireReferralsManage(req, res, next) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  if (req.user?.isSuperadmin || req.user?.permissions?.includes('users.manage')) {
    return next();
  }
  const { SUPERADMIN_EMAILS } = require('../../lib/auth');
  const email = req.session.userEmail?.toLowerCase();
  if (SUPERADMIN_EMAILS.has(email)) return next();

  return res.status(403).json({ error: 'users.manage permission required' });
}

// ── GET /api/admin/referrals/search-users?q= ─────────────────────────────────
// Autocomplete endpoint for admin user search.
router.get('/search-users', requireReferralsManage, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.json({ users: [] });

    const users = await searchUsers(q);
    res.json({ users });
  } catch (err) {
    console.error('[admin-referrals GET /search-users]', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ── POST /api/admin/referrals/attribute ──────────────────────────────────────
// Body: { referee_user_id, referral_code, override_existing }
router.post('/attribute', requireReferralsManage, async (req, res) => {
  try {
    const { referee_user_id, referral_code, override_existing } = req.body;

    if (!referee_user_id || typeof referee_user_id !== 'string') {
      return res.status(400).json({ error: 'referee_user_id (UUID string) is required' });
    }
    if (!referral_code || typeof referral_code !== 'string') {
      return res.status(400).json({ error: 'referral_code is required' });
    }

    const code = referral_code.toUpperCase().trim();

    // 1. Look up referee
    const referee = await getUserById(referee_user_id);
    if (!referee) return res.status(404).json({ error: 'Referee user not found' });

    // 2. Look up referrer by referral code (auth_users.referral_code)
    const referrer = await getReferrerByCode(code);
    if (!referrer) return res.status(404).json({ error: 'Referral code not found' });

    // 3. Cannot attribute to yourself
    if (referrer.id === referee.id) {
      return res.status(400).json({ error: 'Cannot attribute referral to yourself' });
    }

    // 4. Check existing attribution
    const existing = await getAttributionByReferee(referee.id);
    if (existing) {
      if (!override_existing) {
        return res.status(409).json({
          error: 'User already has a referral attribution.',
          existing: {
            referrer_name: existing.referrer_name,
            referrer_email: existing.referrer_email,
            created_at: existing.created_at,
            admin_name: existing.admin_name,
          },
          override_required: true,
        });
      }
      // Override: delete old attribution and reverse points
      await deleteAttribution(existing.id, req.session.userId);
    }

    // 5. Create attribution (stores the code string, not a UUID foreign key)
    await createAttribution({
      refereeId: referee.id,
      referrerId: referrer.id,
      referralCodeUsed: code,
      adminId: req.session.userId,
    });

    // 6. Log admin action
    const { logAdminAction } = require('../../db/admin');
    await logAdminAction({
      actor: req.session.userEmail || 'admin',
      action: 'referral_attributed',
      detail: {
        referee_id: referee.id,
        referee_name: referee.display_name,
        referrer_id: referrer.id,
        referrer_name: referrer.display_name,
        referral_code: code,
        override: !!override_existing,
      },
      ip: req.ip,
    });

    res.json({
      success: true,
      referrer: { id: referrer.id, username: referrer.display_name, email: referrer.email },
      referee:  { id: referee.id,  username: referee.display_name,  email: referee.email },
      points_credited: {
        referrer: REFERRER_POINTS,
        referee: REFEREE_POINTS,
      },
    });
  } catch (err) {
    console.error('[admin-referrals POST /attribute]', err);
    res.status(500).json({ error: 'Failed to attribute referral' });
  }
});

// ── GET /api/admin/referrals/attribution-history ───────────────────────────────
router.get('/attribution-history', requireReferralsManage, async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(5, parseInt(req.query.pageSize, 10) || 20));
    const search   = (req.query.search || '').trim();

    const result = await getAttributionHistory({ page, pageSize, search });
    res.json(result);
  } catch (err) {
    console.error('[admin-referrals GET /attribution-history]', err);
    res.status(500).json({ error: 'Failed to load attribution history' });
  }
});

// ── DELETE /api/admin/referrals/attribution/:referee_user_id ──────────────────
router.delete('/attribution/:referee_user_id', requireReferralsManage, async (req, res) => {
  try {
    const { referee_user_id } = req.params;
    if (!referee_user_id) return res.status(400).json({ error: 'referee_user_id is required' });

    const existing = await getAttributionByReferee(referee_user_id);
    if (!existing) return res.status(404).json({ error: 'No attribution found for this user' });

    await deleteAttribution(existing.id, req.session.userId);

    const { logAdminAction } = require('../../db/admin');
    await logAdminAction({
      actor: req.session.userEmail || 'admin',
      action: 'referral_attribution_reversed',
      detail: {
        referee_id: referee_user_id,
        referrer_id: existing.referrer_id,
        referrer_name: existing.referrer_name,
        referee_name: existing.referee_name,
        points_reversed: { referrer: REFERRER_POINTS, referee: REFEREE_POINTS },
      },
      ip: req.ip,
    });

    res.json({ success: true, message: 'Attribution reversed and points deducted' });
  } catch (err) {
    console.error('[admin-referrals DELETE /attribution]', err);
    res.status(500).json({ error: 'Failed to reverse attribution' });
  }
});

// ── GET /api/admin/referrals/overview ─────────────────────────────────────────
router.get('/overview', requireReferralsManage, async (req, res) => {
  try {
    const overview = await getReferralOverview();
    res.json(overview);
  } catch (err) {
    console.error('[admin-referrals GET /overview]', err);
    res.status(500).json({ error: 'Failed to load overview' });
  }
});

module.exports = router;