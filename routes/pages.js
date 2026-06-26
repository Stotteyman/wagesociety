// routes/pages.js — All rendered page routes.
const express = require('express');
const router = express.Router();
const { getActiveItems } = require('../db/merch');
const { getActiveShopItems } = require('../db/points-shop');
const { getPublishedPosts } = require('../db/blog');
const { getPublicDirectory, getPublicProfileByUsername } = require('../db/profiles');
const { getMemberAccess } = require('../db/orgAccess');
const { getPublicStreams, getStreamsByUsername, getStreamById } = require('../db/livestreams');
const { buildLandingContext } = require('../lib/landing-context');

// ── Landing page ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const ctx = await buildLandingContext();
  ctx.deleted = req.query.deleted === '1';
  res.render('layout', ctx);
});

// ── Auth pages ───────────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.session?.userId || req.session?.userEmail) return res.redirect('/dashboard');
  // Custom auth (routes/auth-custom.js) — no Supabase credentials needed.
  res.render('pages/login', {
    appUrl: process.env.APP_URL || 'https://wagesociety.com',
  });
});

router.get('/join', async (req, res) => {
  const { getReferrerByCode } = require('../db/referrals');
  const email = req.session?.userEmail;

  // Resolve referral code from session or cookie
  const refCode = req.session?.referral_code || req.cookies?.referral_code || null;
  let referrerName = null;
  if (refCode) {
    referrerName = await getReferrerByCode(refCode).catch(() => null);
  }

  if (!email) {
    return res.render('pages/join', {
      userEmail: null,
      currentTier: 'none',
      autoOpenFree: false,
      referralCode: refCode,
      referrerName,
    });
  }

  // Logged in — check membership tier
  const { getUserMembership } = require('../db/memberships');
  const membership = await getUserMembership(email).catch(() => null);
  const currentTier = membership?.plan_slug || 'free';
  const { SUBSCRIPTION_LINKS_MONTHLY, SUBSCRIPTION_LINKS_ANNUAL } = require('../lib/stripe-config');

  res.render('pages/join', {
    userEmail: email,
    currentTier,
    autoOpenFree: false,
    checkoutPlan: ['creator', 'pro'].includes(req.query.checkout) ? req.query.checkout : null,
    subscriptionLinksMonthly: SUBSCRIPTION_LINKS_MONTHLY,
    subscriptionLinksAnnual: SUBSCRIPTION_LINKS_ANNUAL,
    referralCode: refCode,
    referrerName,
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ── Dashboard (auth required) ─────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  const email = req.session.userEmail;
  const userId = req.session.userId;
  const { getProfileByEmail } = require('../db/profiles');
  const { pool } = require('../db/index');
  try {
    const profile = await getProfileByEmail(email);
    const access = await getMemberAccess(email);
    const { getUserMembership } = require('../db/memberships');
    const membership = await getUserMembership(email).catch(() => null);

    // Trial banner: show for free users who haven't dismissed the prompt
    let showTrialBanner = false;
    let trialDismissed = false;
    if (!membership || membership.status === 'canceled') {
      const userRow = await pool.query(
        `SELECT trial_prompt_dismissed_at FROM auth_users WHERE email = $1 LIMIT 1`,
        [email]
      ).catch(() => ({ rows: [] }));
      trialDismissed = !!userRow.rows[0]?.trial_prompt_dismissed_at;
      showTrialBanner = !trialDismissed;
    }

    // Get newsletter subscription
    const sub = await pool.query('SELECT * FROM newsletter_subscriptions WHERE email = $1', [email]).catch(() => ({ rows: [] }));
    const subs = sub.rows[0] || { live_alerts: false, newsletter: false, product_updates: false, community_updates: false };
    const allowed = new Set(['superadmin','admin','manager','staff','helper','user']);
    const hasCreatorTools = allowed.has(access.role) && (access.permissions || []).includes('view_creator_tools');
    const plan = profile?.role === 'banned' ? 'suspended' : (membership?.plan_slug || 'free');

    // Referral stats + activity feed + network graph data
    let referralStats = { totalReferrals: 0, verifiedReferrals: 0, referralPoints: 0, referralTier: 'bronze', referralCode: null };
    let activityFeed = [];
    let networkNodes = [];
    let referralLink = '';

    if (userId) {
      // Referral stats from auth_users
      const refRow = await pool.query(
        `SELECT referral_points, referral_tier, total_referrals, referral_code, created_at FROM auth_users WHERE id = $1 LIMIT 1`,
        [userId]
      ).catch(() => ({ rows: [] }));
      if (refRow.rows.length) {
        const r = refRow.rows[0];
        referralStats = {
          totalReferrals: r.total_referrals || 0,
          verifiedReferrals: 0,
          referralPoints: r.referral_points || 0,
          referralTier: r.referral_tier || 'bronze',
          referralCode: r.referral_code || '',
          joinedAt: r.created_at,
        };
      }
      referralLink = `${req.protocol}://${req.get('host')}/join?ref=${referralStats.referralCode || ''}`;

      // Activity feed: mix of point_transactions + recent referrals + stream/livestream events
      const [ptRows, refRows, streamRows] = await Promise.all([
        pool.query(`SELECT amount, type, description, created_at FROM point_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 8`, [userId]).catch(() => ({ rows: [] })),
        pool.query(`SELECT r.created_at, r.status, u.display_name, u.username FROM referrals r JOIN auth_users u ON u.id = r.referred_user_id WHERE r.referrer_id = $1 ORDER BY r.created_at DESC LIMIT 4`, [userId]).catch(() => ({ rows: [] })),
        pool.query(`SELECT username, title, platform, started_at FROM member_livestreams WHERE username = $1 AND started_at > NOW() - INTERVAL '7 days' ORDER BY started_at DESC LIMIT 3`, [profile?.username]).catch(() => ({ rows: [] })),
      ]);

      // Build activity feed
      ptRows.rows.forEach(t => {
        const icon = t.type === 'referral_signup' || t.type === 'referral_verified' ? '🎁'
          : t.type === 'purchase' || t.type === 'shop_purchase' ? '🛍️'
          : t.type === 'joined_referral' ? '⚡'
          : t.amount > 0 ? '✨' : '💸';
        activityFeed.push({ icon, type: t.type, description: t.description || (t.amount > 0 ? `+${t.amount} points` : `${t.amount} points`), date: t.created_at, kind: 'point' });
      });
      refRows.rows.forEach(r => {
        activityFeed.push({ icon: '👤', type: 'referral_signup', description: `${r.display_name || r.username} joined via your link`, date: r.created_at, kind: 'referral' });
      });
      streamRows.rows.forEach(s => {
        activityFeed.push({ icon: '📡', type: 'stream_go_live', description: `Went live: ${s.title || s.platform}`, date: s.started_at, kind: 'stream' });
      });
      // Sort by date desc, take top 10
      activityFeed.sort((a, b) => new Date(b.date) - new Date(a.date));
      activityFeed = activityFeed.slice(0, 10);

      // Network graph nodes: current user (center) + direct referrals (ring 1) + second-degree (ring 2)
      // Direct referrals: first ring
      const directRows = await pool.query(
        `SELECT u.id, u.display_name, u.username, u.avatar_url, u.referral_tier, COUNT(r2.id)::int as referral_count
         FROM auth_users u
         JOIN referrals r ON r.referred_user_id = u.id
         LEFT JOIN referrals r2 ON r2.referrer_id = u.id
         WHERE r.referrer_id = $1
         GROUP BY u.id LIMIT 25`,
        [userId]
      ).catch(() => ({ rows: [] }));

      networkNodes = directRows.rows.map(u => ({
        id: u.id,
        label: u.display_name || u.username,
        tier: u.referral_tier || 'free',
        referralCount: u.referral_count || 0,
        avatarUrl: u.avatar_url || null,
        ring: 1, // first ring
      }));
    }

    res.render('pages/dashboard', {
      email,
      username: profile?.username || email.split('@')[0],
      displayName: profile?.display_name || profile?.username || email.split('@')[0],
      avatarUrl: profile?.avatar_url || null,
      bio: profile?.bio || null,
      role: access.role || 'user',
      permissions: access.permissions || [],
      hasCreatorTools,
      plan,
      subscriptions: subs,
      showTrialBanner,
      membership,
      showTrialModal: !!req.session.showTrialPrompt && (!membership || membership.status === 'canceled'),
      referralStats,
      referralLink,
      activityFeed,
      networkNodes,
    });
    // Clear the post-signup trial prompt flag (show it once)
    if (req.session.showTrialPrompt) req.session.showTrialPrompt = null;
  } catch (e) {
    console.error('[dashboard]', e);
    res.redirect('/login');
  }
});

// ── Settings ────────────────────────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  const { getUserMembership, getAllUserMemberships } = require('../db/memberships');

  // getUserMembership returns only active/trialing; getAllUserMemberships returns all
  // statuses (used to show canceled trial status after user cancels from Settings).
  const [activeMembership, allMemberships] = await Promise.all([
    getUserMembership(req.session.userEmail).catch(() => null),
    getAllUserMemberships(req.session.userEmail).catch(() => []),
  ]);

  // Show the most recently cancelled membership (for post-cancel feedback)
  const canceledMembership = allMemberships.find(m => m.status === 'canceled') || null;

  let trialDaysRemaining = null;
  if (activeMembership && activeMembership.status === 'trialing' && activeMembership.trial_ends_at) {
    const ends = new Date(activeMembership.trial_ends_at);
    trialDaysRemaining = Math.max(0, Math.ceil((ends - Date.now()) / (1000 * 60 * 60 * 24)));
  }

  const showCanceledAlert = req.query.canceled === '1' || !!req.session.trialCanceledFromPortal;
  if (req.session.trialCanceledFromPortal) req.session.trialCanceledFromPortal = null;

  // Use activeMembership for the template (current plan), but include canceledMembership
  // so the template can show post-cancel feedback.
  res.render('pages/settings', {
    discordClientId: process.env.DISCORD_CLIENT_ID || '',
    membership: activeMembership || canceledMembership,
    canceledMembership,
    trialDaysRemaining,
    showCanceledAlert,
  });
});

// ── Referrals dashboard ─────────────────────────────────────────────────────
router.get('/dashboard/referrals', async (req, res) => {
  if (!req.session?.userId) return res.redirect('/login');
  const { getUserById } = require('../db/users');
  const { getReferralStats, getReferrerUsername, getRecentTransactions, getRecentReferrals } = require('../db/referrals');
  const { calculateReferralTier } = require('../lib/referral-codes');

  const [user, stats, referrerName, transactions, referrals] = await Promise.all([
    getUserById(req.session.userId).catch(() => null),
    getReferralStats(req.session.userId).catch(() => ({ totalReferrals: 0, verifiedReferrals: 0, monthlyRank: 0, pointsBalance: 0 })),
    getReferrerUsername(req.session.userId).catch(() => null),
    getRecentTransactions(req.session.userId).catch(() => []),
    getRecentReferrals(req.session.userId).catch(() => []),
  ]);

  if (!user) return res.redirect('/login');

  const tier = calculateReferralTier(stats.totalReferrals);
  const conversionRate = stats.totalReferrals > 0
    ? Math.round((stats.verifiedReferrals / stats.totalReferrals) * 100)
    : 0;

  res.render('pages/referrals', {
    referralCode: user.referral_code || 'WAGE-NONE',
    stats,
    tier,
    conversionRate,
    referrerName,
    transactions,
    referrals,
    flash: req.query.points_purchased
      ? 'Points added to your account!'
      : req.query.canceled
        ? 'Purchase canceled — no charge was made.'
        : null,
  });
});

// ── Settings / Security ─────────────────────────────────────────────────────
router.get('/settings/security', async (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  const { getUserByEmail } = require('../db/users');
  const user = await getUserByEmail(req.session.userEmail).catch(() => null);
  res.render('pages/settings-security', {
    forceChange: req.query.force_change === '1',
    error: req.query.error || null,
    success: req.query.success === '1',
    currentEmail: req.session.userEmail,
    hasPassword: !!(user && user.password_hash),
  });
});

router.post('/settings/security', async (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  const email = req.session.userEmail;
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.redirect('/settings/security?error=' + encodeURIComponent('Password must be at least 8 characters.'));
  }
  if (newPassword !== confirmPassword) {
    return res.redirect('/settings/security?error=' + encodeURIComponent('Passwords do not match.'));
  }

  const { getUserByEmail, setUserPassword } = require('../db/users');
  const bcrypt = require('bcryptjs');

  let user;
  try {
    user = await getUserByEmail(email);
  } catch (e) {
    console.error('[settings/security] getUserByEmail error:', e.message);
    return res.redirect('/settings/security?error=' + encodeURIComponent('Server error. Please try again.'));
  }

  if (!user) return res.redirect('/login');

  // If user has a password, verify current password first
  if (user.password_hash) {
    if (!currentPassword) {
      return res.redirect('/settings/security?error=' + encodeURIComponent('Enter your current password.'));
    }
    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) {
      return res.redirect('/settings/security?error=' + encodeURIComponent('Current password is incorrect.'));
    }
  }

  try {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await setUserPassword(email, passwordHash);
  } catch (err) {
    console.error('[settings/security] password update error:', err.message);
    return res.redirect('/settings/security?error=' + encodeURIComponent('Failed to update password. Please try again.'));
  }

  res.redirect('/settings/security?success=1');
});

// ── Profile edit — consolidated into /settings; old paths redirect ────────────
router.get('/profile/edit', (_req, res) => res.redirect(301, '/settings'));
router.get('/creators/edit', (_req, res) => res.redirect(301, '/settings'));

// ── Onboarding ──────────────────────────────────────────────────────────────
router.get('/onboarding', (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  res.render('pages/onboarding', {
    email: req.session.userEmail,
    joinServer: req.query.join_server === '1',
    discordServerInvite: process.env.DISCORD_SERVER_INVITE || null,
  });
});

// ── Terms ────────────────────────────────────────────────────────────────────
router.get('/terms', (_req, res) => res.render('pages/terms'));

// ── Privacy ──────────────────────────────────────────────────────────────────
router.get('/privacy', (_req, res) => res.render('pages/privacy'));

// ── Memberships / pricing tiers ─────────────────────────────────────────────
router.get('/pricing', (req, res) => res.redirect(301, '/memberships'));
router.get('/subscriptions', (req, res) => res.redirect(301, '/memberships'));
router.get('/memberships', async (req, res) => {
  const { pool } = require('../db/index');
  const { getUserMembership } = require('../db/memberships');
  const email = req.session?.userEmail;
  let currentMembership = null;
  let trialDismissed = false;
  let showTrialModal = false;

  if (email) {
    currentMembership = await getUserMembership(email).catch(() => null);
    const userRow = await pool.query(
      `SELECT trial_prompt_dismissed_at FROM auth_users WHERE email = $1 LIMIT 1`,
      [email]
    ).catch(() => ({ rows: [] }));
    const row = userRow.rows[0] || {};
    trialDismissed = !!row.trial_prompt_dismissed_at;

    // Show trial modal if: free user, hasn't dismissed, no active membership
    const hasActivePlan = currentMembership && ['active', 'trialing'].includes(currentMembership.status);
    showTrialModal = !hasActivePlan && !trialDismissed;
  }

  // Read from membership_tiers (admin-managed source of truth) + membership_plans
  // mp.features is text[], mt.features is jsonb — cast to avoid type mismatch
  const rows = await pool.query(
    `SELECT mt.slug, mt.name, mt.description,
            COALESCE(mp.display_price, '$' || (mt.price_cents / 100) || '/mo') as display_price,
            mt.price_cents,
            COALESCE(to_jsonb(mp.features), mt.features, '[]'::jsonb) as features,
            COALESCE(mp.is_active, mt.is_active, true) as is_active,
            COALESCE(mp.sort_order, mt.sort_order, 0) as sort_order
     FROM membership_tiers mt
     LEFT JOIN membership_plans mp ON mp.slug = mt.slug
     WHERE COALESCE(mp.is_active, mt.is_active, true) = true
     ORDER BY COALESCE(mp.sort_order, mt.sort_order, 0)`
  ).catch((err) => { console.error('[memberships] Query error:', err.message); return { rows: [] }; });

  // Pass annual prices (monthly × 10 = "2 months free")
  const plansWithAnnual = rows.rows.map(p => ({
    ...p,
    annual_price: p.price_cents > 0 ? p.price_cents * 10 : 0,
  }));

  let trialDaysRemaining = null;
  if (currentMembership && currentMembership.status === 'trialing' && currentMembership.trial_ends_at) {
    const ends = new Date(currentMembership.trial_ends_at);
    trialDaysRemaining = Math.max(0, Math.ceil((ends - Date.now()) / (1000 * 60 * 60 * 24)));
  }

  const billingCycle = req.query.cycle === 'annual' ? 'annual' : 'monthly';

  res.render('pages/memberships', {
    plans: plansWithAnnual,
    currentMembership,
    trialDaysRemaining,
    billingCycle,
    success: req.query.success === '1',
    canceled: req.query.canceled === '1',
    upgrade: req.query.upgrade || null,
    userEmail: email,
    showTrialModal,
  });
});

// ── Checkout pages ──────────────────────────────────────────────────────────
router.get('/checkout', async (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  const { pool } = require('../db/index');
  const planSlug = req.query.plan || req.session?.pendingCheckout?.tier || null;
  const billingCycle = req.query.cycle === 'annual' ? 'annual' : 'monthly';

  if (planSlug) {
    const rows = await pool.query(
      `SELECT mt.slug, mt.name, mt.price_cents,
              COALESCE(to_jsonb(mp.features), mt.features, '[]'::jsonb) as features
       FROM membership_tiers mt
       LEFT JOIN membership_plans mp ON mp.slug = mt.slug
       WHERE mt.slug = $1 AND COALESCE(mp.is_active, mt.is_active, true) = true`,
      [planSlug]
    ).catch(() => ({ rows: [] }));
    const plan = rows.rows[0];
    if (plan) {
      return res.render('pages/checkout', {
        planSlug: plan.slug,
        planName: plan.name,
        planPrice: (plan.price_cents / 100).toFixed(0),
        billingCycle,
        features: plan.features || [],
      });
    }
  }

  res.redirect('/memberships');
});

router.get('/checkout/annual', async (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  const { pool } = require('../db/index');
  const planSlug = req.query.plan || req.session?.pendingCheckout?.tier || null;

  if (planSlug) {
    const rows = await pool.query(
      `SELECT mt.slug, mt.name, mt.price_cents,
              COALESCE(to_jsonb(mp.features), mt.features, '[]'::jsonb) as features
       FROM membership_tiers mt
       LEFT JOIN membership_plans mp ON mp.slug = mt.slug
       WHERE mt.slug = $1 AND COALESCE(mp.is_active, mt.is_active, true) = true`,
      [planSlug]
    ).catch(() => ({ rows: [] }));
    const plan = rows.rows[0];
    if (plan) {
      return res.render('pages/checkout/annual', {
        planSlug: plan.slug,
        planName: plan.name,
        planPrice: ((plan.price_cents * 10) / 100).toFixed(0),
        features: plan.features || [],
      });
    }
  }

  res.redirect('/memberships?cycle=annual');
});

router.get('/checkout/trial', async (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  const { pool } = require('../db/index');
  const { getUserMembership } = require('../db/memberships');
  const email = req.session.userEmail;

  const membership = await getUserMembership(email).catch(() => null);
  let daysRemaining = 7;
  let trialEndDate = null;

  if (membership && membership.status === 'trialing' && membership.trial_ends_at) {
    const ends = new Date(membership.trial_ends_at);
    daysRemaining = Math.max(0, Math.ceil((ends - Date.now()) / (1000 * 60 * 60 * 24)));
    trialEndDate = ends.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  const planSlug = req.query.plan || membership?.plan_slug || null;
  const billingCycle = req.query.cycle === 'annual' ? 'annual' : 'monthly';

  if (planSlug) {
    const rows = await pool.query(
      `SELECT mt.slug, mt.name, mt.price_cents,
              COALESCE(to_jsonb(mp.features), mt.features, '[]'::jsonb) as features
       FROM membership_tiers mt
       LEFT JOIN membership_plans mp ON mp.slug = mt.slug
       WHERE mt.slug = $1 AND COALESCE(mp.is_active, mt.is_active, true) = true`,
      [planSlug]
    ).catch(() => ({ rows: [] }));
    const plan = rows.rows[0];
    if (plan) {
      return res.render('pages/checkout/trial', {
        planSlug: plan.slug,
        planName: plan.name,
        planPrice: (plan.price_cents / 100).toFixed(0),
        billingCycle,
        daysRemaining,
        trialEndDate,
        features: plan.features || [],
      });
    }
  }

  res.redirect('/memberships');
});

// ── Welcome upgrade — post-signup tier selection ────────────────────────────
router.get('/welcome-upgrade', async (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  const email = req.session.userEmail;
  const { getUserMembership } = require('../db/memberships');
  const membership = await getUserMembership(email).catch(() => null);

  // Already subscribed — skip straight to dashboard
  if (membership && ['active', 'trialing'].includes(membership.status)) {
    return res.redirect('/dashboard');
  }

  // Fetch tiers (same query as /memberships, cast mp.features to jsonb)
  const rows = await pool.query(
    `SELECT mt.slug, mt.name, mt.description, mt.price_cents,
            COALESCE(to_jsonb(mp.features), mt.features, '[]'::jsonb) as features,
            COALESCE(mp.sort_order, mt.sort_order, 0) as sort_order
     FROM membership_tiers mt
     LEFT JOIN membership_plans mp ON mp.slug = mt.slug
     WHERE COALESCE(mp.is_active, mt.is_active, true) = true
     ORDER BY COALESCE(mp.sort_order, mt.sort_order, 0)`
  ).catch(() => ({ rows: [] }));

  const plans = rows.rows.map(p => ({
    ...p,
    annual_price: p.price_cents > 0 ? p.price_cents * 10 : 0,
  }));

  res.render('pages/welcome-upgrade', { plans, userEmail: email });
});

// ── Appeals ──────────────────────────────────────────────────────────────────
router.get('/appeals', (req, res) => {
  res.render('pages/appeals', { userEmail: req.session?.userEmail });
});

// ── Dashboard tool pages ─────────────────────────────────────────────────────
router.get('/dashboard/tools/:tool', (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  res.render('pages/tool', { tool: req.params.tool });
});

// ── Admin pages ─────────────────────────────────────────────────────────────
router.get('/admin/users', (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  if (!req.user?.isSuperadmin && !req.user?.permissions?.includes('users.manage')) {
    return res.status(403).render('pages/403', { message: 'users.manage permission required' });
  }
  res.render('pages/admin-users', { userEmail: req.session.userEmail });
});
router.get('/admin/shop', (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  if (!req.user?.isSuperadmin && !req.user?.permissions?.includes('users.manage')) {
    return res.status(403).render('pages/403', { message: 'users.manage permission required' });
  }
  res.render('pages/admin-shop', { userEmail: req.session.userEmail });
});
router.get('/admin/point-shop', (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  if (!req.user?.isSuperadmin && !req.user?.permissions?.includes('users.manage')) {
    return res.status(403).render('pages/403', { message: 'users.manage permission required' });
  }
  res.render('pages/admin-point-shop', { userEmail: req.session.userEmail });
});
// ── Admin Roles — /admin/roles (SUPER_ADMIN only) ───────────────────────────
// Also accessible at /dashboard/admin/roles for backwards compat
router.get('/admin/roles', (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  if (!req.user?.isSuperadmin) {
    return res.status(403).render('pages/403', { message: 'SUPER_ADMIN role required for roles management' });
  }
  res.render('pages/admin-roles', { userEmail: req.session.userEmail });
});
router.get('/dashboard/admin/roles', (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  if (!req.user?.isSuperadmin) {
    return res.status(403).render('pages/403', { message: 'SUPER_ADMIN role required for roles management' });
  }
  res.render('pages/admin-roles', { userEmail: req.session.userEmail });
});

// ── Discord servers ──────────────────────────────────────────────────────────
router.get('/dashboard/discord/servers', (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  const { listServersByUser } = require('../db/discord-servers');
  const { getDiscordLinkByUserId } = require('../db/discord');
  const userId = req.session.userId;
  Promise.all([
    listServersByUser(userId).catch(() => []),
    getDiscordLinkByUserId(userId).catch(() => null),
  ]).then(([servers, discordLink]) => {
    res.render('pages/dashboard/discord-servers', { servers, discordLink });
  }).catch((err) => { console.error(err); res.status(500).render('pages/403', { message: 'Failed to load servers' }); });
});

// ── Discord overview page — requires Discord account linked ────────────────
router.get('/dashboard/discord', (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  const { listServersByUser } = require('../db/discord-servers');
  listServersByUser(req.session.userId)
    .then((servers) => {
      const connected = servers.filter(s => s.connected_at && s.owner_wageos_user_id);
      res.render('pages/dashboard/discord', { servers, connected, userId: req.session.userId });
    })
    .catch((err) => { console.error(err); res.status(500).render('pages/403', { message: 'Failed to load servers' }); });
});

// ── Discord connect page — step 1: OAuth link, step 2: server selection ──────
router.get('/dashboard/discord/connect', (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  const { getDiscordLinkByUserId } = require('../db/discord');
  const { listServersByUser } = require('../db/discord-servers');
  const userId = req.session.userId;

  Promise.all([
    getDiscordLinkByUserId(userId).catch(() => null),
    listServersByUser(userId).catch(() => []),
  ]).then(([discordLink, servers]) => {
    res.render('pages/dashboard/discord-connect', {
      discordLink,
      servers,
      step: req.query.step || (discordLink ? 'select' : 'oauth'),
      userId,
    });
  }).catch((err) => { console.error(err); res.status(500).render('pages/403', { message: 'Failed to load' }); });
});

// ── Server management panel ───────────────────────────────────────────────────
router.get('/dashboard/discord/:guildId', (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  const { getServerOwnership } = require('../db/discord-servers');
  const { getServerConfig } = require('../db/discord-servers');

  getServerOwnership(req.params.guildId, req.session.userId)
    .then((server) => {
      if (!server) return res.status(403).render('pages/403', { message: 'You do not own this Discord server' });
      res.render('pages/dashboard/discord-manage', {
        server,
        guildId: req.params.guildId,
        tab: req.query.tab || 'overview',
      });
    })
    .catch((err) => { console.error(err); res.status(500).render('pages/403', { message: 'Failed to load server' }); });
});

// ── Merch / Marketplace ──────────────────────────────────────────────────────
router.get('/merch', async (_req, res) => {
  const items = await getActiveItems().catch(() => []);
  res.render('pages/merch', { items });
});
// /marketplace is the nav-facing alias with Point Shop tab
router.get('/marketplace', async (req, res) => {
  const [items, shopItems] = await Promise.all([
    getActiveItems().catch(() => []),
    getActiveShopItems().catch(() => []),
  ]);
  const tab = req.query.tab || 'merch';
  const isLoggedIn = !!(req.session?.userId || req.session?.userEmail);
  res.render('pages/merch', { items, shopItems, tab, isLoggedIn });
});

// /live is an alias for /streams
router.get('/live', async (req, res) => {
  res.redirect('/streams');
});
// ── Streams page — all members' OAuth-connected livestreams ─────────────────
// Splits streams into "Live Now" and "Recent Streams" (ended ≤ 7 days ago).
router.get('/streams', async (req, res) => {
  const allStreams = await getPublicStreams().catch(() => []);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const liveStreams    = allStreams.filter(s => s.status === 'live');
  const recentStreams  = allStreams.filter(s =>
    s.status === 'recent' ||
    (s.ended_at && new Date(s.ended_at) >= sevenDaysAgo)
  );

  res.render('pages/streams', {
    liveStreams,
    recentStreams,
    canUseAutoclipper: false,
  });
});

// ── Individual stream embed page ────────────────────────────────────────────
router.get('/streams/:id', async (req, res) => {
  const stream = await getStreamById(req.params.id).catch(() => null);
  if (!stream) {
    return res.redirect('/streams');
  }
  res.render('pages/streams/id', { stream });
});

// ── Creator directory ─────────────────────────────────────────────────────────
router.get('/directory', async (req, res) => {
  const search = req.query.search || '';
  const sort   = ['recent','alpha','tier'].includes(req.query.sort) ? req.query.sort : 'recent';
  const page   = Math.max(1, parseInt(req.query.page, 10) || 1);
  const email  = req.session?.userEmail;
  const rawTier = req.query.tier || null;
  const tier = ['creator', 'pro', 'elite', 'unlimited', 'free'].includes(rawTier) ? rawTier : null;
  const result = await getPublicDirectory({ search, sort, page, perPage: 20, tier }).catch(() => ({
    members: [], total: 0, page: 1, perPage: 20,
  }));
  const totalPages = Math.ceil(result.total / result.perPage);
  res.render('pages/directory', {
    members:    result.members,
    total:      result.total,
    page,
    totalPages,
    search,
    sort,
    userEmail:  email,
    activeTier: tier,
  });
});

// Redirect /discover to /creators (consolidated canonical link)
router.get('/discover', (req, res) => res.redirect(301, '/creators'));

// Alias for /creators
router.get('/creators', async (req, res) => {
  const search = req.query.search || '';
  const sort   = ['recent','alpha','tier'].includes(req.query.sort) ? req.query.sort : 'recent';
  const page   = Math.max(1, parseInt(req.query.page, 10) || 1);
  const email  = req.session?.userEmail;
  // Tier filter: 'creator', 'pro', 'elite' — mapped from URL param to DB tier values
  const rawTier = req.query.tier || null;
  const tier = ['creator', 'pro', 'elite', 'unlimited', 'free'].includes(rawTier) ? rawTier : null;

  const result = await getPublicDirectory({ search, sort, page, perPage: 20, tier }).catch(() => ({
    members: [], total: 0, page: 1, perPage: 20,
  }));
  const totalPages = Math.ceil(result.total / result.perPage);

  res.render('pages/directory', {
    members:     result.members,
    total:       result.total,
    page,
    totalPages,
    search,
    sort,
    userEmail:   email,
    activeTier:  tier,
  });
});

// ── Blog/news ─────────────────────────────────────────────────────────────────
router.get('/news', async (req, res) => {
  const posts = await getPublishedPosts().catch(() => []);
  const email = req.session?.userEmail;
  let canPost = false;
  if (email) {
    const access = await getMemberAccess(email);
    canPost = !access.ban && access.permissions.includes('blog.create');
  }
  res.render('pages/news', { posts, canPost });
});

// ── FAQ ──────────────────────────────────────────────────────────────────────
router.get('/faq', async (_req, res) => {
  const { getActiveFaqs } = require('../db/faq');
  const faqs = await getActiveFaqs().catch(() => []);
  res.render('pages/faq', { faqs });
});

// ── Tools (placeholder hub) ─────────────────────────────────────────────────
router.get('/tools', (_req, res) => res.render('pages/tools'));

// ── Community (placeholder hub) ─────────────────────────────────────────────
router.get('/community', (_req, res) => res.render('pages/community'));

// ── Search page ─────────────────────────────────────────────────────────────
router.get('/search', (req, res) => {
  res.render('pages/search', { q: req.query.q || '' });
});

// ── Point Shop (auth required) — full data load via db/points-shop.js ───────
router.get('/point-shop', async (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  const { getActiveShopItems, getUserPurchases } = require('../db/points-shop');
  const { pool } = require('../db/index');
  const userId = req.session.userId;
  const [items, purchases] = await Promise.all([
    getActiveShopItems().catch(() => []),
    getUserPurchases(userId).catch(() => []),
  ]);
  const userRow = await pool.query(
    'SELECT referral_points, badges FROM auth_users WHERE id = $1',
    [userId]
  ).catch(() => ({ rows: [{ referral_points: 0, badges: [] }] }));
  res.render('pages/point-shop', {
    items,
    balance: userRow.rows[0]?.referral_points || 0,
    badges: userRow.rows[0]?.badges || [],
    purchases,
    purchasedItemIds: purchases.map(p => p.item_id),
    flash: null,
    userEmail: req.session.userEmail,
  });
});

// ── Donate page ─────────────────────────────────────────────────────────────
router.get('/donate', async (req, res) => {
  const { getDonationTotal } = require('../db/donations');
  try {
    const totals = await getDonationTotal();
    res.render('pages/donate', { totals, canceled: req.query.canceled === '1' });
  } catch (_) {
    res.render('pages/donate', { totals: { total_cents: 0, goal_cents: 100000, count: 0, percentage: 0 }, canceled: req.query.canceled === '1' });
  }
});

// ── Membership checkout success ─────────────────────────────────────────────
// Polsia Stripe redirects here with ?session_id=cs_xxx after a successful subscription.
// Before redirecting to Stripe, we stored { tier, billing_cycle } in
// req.session.pendingCheckout (via /api/checkout/redirect).
// We activate membership in DB via webhook (checkout.session.completed).
// This page reads pendingCheckout from session + membership from DB.
router.get('/checkout/success', async (req, res) => {
  const sessionId = req.query.session_id;
  const userEmail = req.session?.userEmail;

  let tier = null;
  let tierName = null;
  let billingCycle = null;
  let memberName = null;

  // First: read what we stored in session before redirecting to Stripe
  const pending = req.session.pendingCheckout;
  if (pending) {
    tier = pending.tier;
    billingCycle = pending.billingCycle;
    // Clean up the pending checkout now that we're showing success
    delete req.session.pendingCheckout;
  }

  // Second: verify via checkout_sessions table (shows our system knows about this payment)
  if (!tier && sessionId && sessionId !== 'CHECKOUT_SESSION_ID') {
    const { getBySessionId } = require('../db/checkout_sessions');
    const cs = await getBySessionId(sessionId).catch(() => null);
    if (cs) {
      tier = cs.plan_slug;
      billingCycle = cs.billing_cycle;
    }
  }

  // Third: look up user for display name + verify DB activation
  if (userEmail) {
    const { getUserByEmail } = require('../db/users');
    const user = await getUserByEmail(userEmail).catch(() => null);
    memberName = user?.display_name || null;

    // DB has the authoritative tier after webhook fires — always check
    const { getUserMembership } = require('../db/memberships');
    const membership = await getUserMembership(userEmail).catch(() => null);
    if (membership) {
      tier = membership.plan_slug;
      tierName = membership.name;
      billingCycle = membership.billing_cycle;
    }
  }

  // Resolve tier name from membership_plans
  if (tier && !tierName) {
    const { pool } = require('../db/index');
    const row = await pool.query(
      'SELECT name FROM membership_plans WHERE slug = $1 LIMIT 1',
      [tier]
    ).catch(() => ({ rows: [] }));
    tierName = row.rows[0]?.name || (tier.charAt(0).toUpperCase() + tier.slice(1));
  }

  // Flag from /api/checkout/redirect — set when we stored pendingCheckout before
  // Stripe redirected the user here. Trumps ?success=1 for post-Stripe navigation.
  const fromRedirect = req.session.checkoutSuccess === true;
  delete req.session.checkoutSuccess;

  res.render('pages/checkout-success', {
    userEmail,
    tier,
    tierName,
    billingCycle,
    memberName,
    showSuccess: fromRedirect || req.query.success === '1',
  });
});

// ── Donate success page ─────────────────────────────────────────────────────
// Polsia Stripe redirects back with ?session_id=cs_xxx after a successful donation.
// We look up the completed donation in our DB to display donor info (not trust URL params alone).
router.get('/donate/success', async (req, res) => {
  const sessionId = req.query.session_id;
  if (!sessionId || sessionId === 'CHECKOUT_SESSION_ID') {
    return res.redirect('/donate');
  }

  const { getDonationByStripeSession } = require('../db/donations');
  const record = await getDonationByStripeSession(sessionId).catch(() => null);

  if (record) {
    res.render('pages/donate-success', {
      donorName:    record.donor_name,
      donorAmount:  record.amount_cents,
      donorMessage: record.donor_message || null,
    });
  } else {
    // Session not found in DB —Polsia may not have forwarded the webhook yet,
    // or this was a quick-amount fixed link with no DB record. Show name from URL params as fallback.
    res.render('pages/donate-success', {
      donorName:    req.query.name    || null,
      donorAmount:  req.query.amount  || null,
      donorMessage: req.query.message ? decodeURIComponent(req.query.message) : null,
    });
  }
});

// ── Public creator profile (/creators/:username) ─────────────────────────
router.get('/creators/:username', async (req, res) => {
  const username = req.params.username;
  try {
    const profile = await getPublicProfileByUsername(username);
    if (!profile) return res.status(404).render('pages/profile-not-found', { username });

    const creatorStreams = await getStreamsByUsername(username).catch(() => []);

    res.render('pages/profile', {
      profile,
      userEmail: req.session?.userEmail,
      referralTier: profile.referral_tier || null,
      creatorStreams,
    });
  } catch (err) {
    res.status(500).render('pages/profile-not-found', { username });
  }
});

// ── WAGE World game portal ───────────────────────────────────────────────────
// Phaser game experience — camera fly-through from homepage lands here.
// Shows game loader + back-to-homepage option.
router.get('/play', (req, res) => {
  res.render('pages/play', {
    userEmail: req.session?.userEmail || null,
  });
});

router.get('/wageworld', (req, res) => {
  res.render('pages/play', {
    userEmail: req.session?.userEmail || null,
  });
});

// ── Username catch-all — must be LAST ──────────────────────────────────────
// Handles /stotteyman, /johnsmith, etc. when the creator has a profile.
// Express resolves all other routes first; only non-matched paths reach here.
// Guard: do not treat reserved app paths as usernames.
router.get('/:username', async (req, res) => {
  const RESERVED = ['point-shop', 'shop', 'admin', 'api', 'auth', 'dashboard',
    'settings', 'login', 'join', 'logout', 'donate', 'merch', 'creators',
    'streams', 'live', 'news', 'faq', 'terms', 'privacy', 'memberships', 'welcome-upgrade',
    'checkout', 'checkout-success', 'wageworld'];
  if (RESERVED.includes(req.params.username)) {
    return res.status(404).render('pages/404', {});
  }
  const username = req.params.username;
  try {
    const profile = await getPublicProfileByUsername(username);
    if (!profile) return res.status(404).render('pages/profile-not-found', { username });
    const creatorStreams = await getStreamsByUsername(username).catch(() => []);
    res.render('pages/profile', {
      profile,
      userEmail: req.session?.userEmail,
      referralTier: profile.referral_tier || null,
      creatorStreams,
    });
  } catch (err) {
    res.status(500).render('pages/profile-not-found', { username });
  }
});

// GET /play — WAGE World portal destination (after flythrough)
module.exports = router;
