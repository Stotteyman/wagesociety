// routes/pages.js — All rendered page routes.
const express = require('express');
const router = express.Router();
const { getActiveItems } = require('../db/merch');
const { getPublishedPosts } = require('../db/blog');
const { getPublicDirectory, getPublicProfileByUsername } = require('../db/profiles');
const { getMemberAccess } = require('../db/orgAccess');
const { getAllStreams } = require('../db/livestreams');
const { buildLandingContext } = require('../lib/landing-context');

// ── Landing page ─────────────────────────────────────────────────────────────
router.get('/', (_req, res) => {
  res.render('layout', buildLandingContext());
});

// ── Auth pages ───────────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.session?.userEmail) return res.redirect('/dashboard');
  // Pass Supabase public credentials so the client-side Supabase JS SDK can
  // call signInWithOAuth() with PKCE. SUPABASE_ANON_KEY is the publishable key
  // — safe to embed in HTML (same as Supabase dashboard's anon/public key).
  res.render('pages/login', {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    appUrl: process.env.APP_URL || 'https://ai.wagesociety.com',
  });
});

router.get('/join', async (req, res) => {
  const email = req.session?.userEmail;

  if (!email) {
    return res.render('pages/join', {
      userEmail: null,
      currentTier: 'none',
      autoOpenFree: false,
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
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ── Dashboard (auth required) ─────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  const email = req.session.userEmail;
  const { getProfileByEmail } = require('../db/profiles');
  const { pool } = require('../db/index');
  try {
    const profile = await getProfileByEmail(email);
    const access = await getMemberAccess(email);
    // Get newsletter subscription
    const sub = await pool.query('SELECT * FROM newsletter_subscriptions WHERE email = $1', [email]).catch(() => ({ rows: [] }));
    const subs = sub.rows[0] || { live_alerts: false, newsletter: false, product_updates: false, community_updates: false };
    const allowed = new Set(['superadmin','admin','manager','staff','helper','user']);
    const hasCreatorTools = allowed.has(access.role) && (access.permissions || []).includes('view_creator_tools');
    res.render('pages/dashboard', {
      email,
      username: profile?.username || email.split('@')[0],
      displayName: profile?.display_name || profile?.username || email.split('@')[0],
      avatarUrl: profile?.avatar_url || null,
      bio: profile?.bio || null,
      role: access.role || 'user',
      permissions: access.permissions || [],
      hasCreatorTools,
      plan: profile?.role === 'banned' ? 'suspended' : 'free',
      subscriptions: subs,
    });
  } catch (e) {
    res.redirect('/login');
  }
});

// ── Settings ────────────────────────────────────────────────────────────────
router.get('/settings', (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  res.render('pages/settings');
});

// ── Settings / Security (GET) — also handles POST (password change) ──────────
router.get('/settings/security', (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  res.render('pages/settings-security', {
    forceChange: req.query.force_change === '1',
  });
});

router.post('/settings/security', async (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  if (req.session.userEmail !== 'root@wagesociety.com') {
    return res.redirect('/settings');
  }
  const { new_password, confirm_password } = req.body;
  if (!new_password || new_password.length < 8) {
    return res.redirect('/settings/security?force_change=1&error=min_length');
  }
  if (new_password === 'admin') {
    return res.redirect('/settings/security?force_change=1&error=no_reuse');
  }
  if (new_password !== confirm_password) {
    return res.redirect('/settings/security?force_change=1&error=mismatch');
  }

  // Look up the Supabase auth user ID for root@wagesociety.com
  const { createClient } = require('@supabase/supabase-js');
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  let authUid;
  try {
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const rootUser = users?.users?.find(u => u.email === 'root@wagesociety.com');
    if (!rootUser) throw new Error('root user not found in auth.users');
    authUid = rootUser.id;
  } catch (e) {
    console.error('[settings/security] could not find root auth UID:', e.message);
    return res.redirect('/settings/security?force_change=1&error=not_found');
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(authUid, {
    password: new_password,
  });

  if (error) {
    console.error('[settings/security] password update error:', error.message);
    return res.redirect('/settings/security?force_change=1&error=' + encodeURIComponent(error.message));
  }

  // Clear the must_change_password flag
  const { pool } = require('../db/index');
  await pool.query(
    'UPDATE member_profiles SET must_change_password = FALSE, updated_at = NOW() WHERE email = $1',
    ['root@wagesociety.com']
  );

  res.redirect('/dashboard');
});

// ── Profile edit (/creators/edit — auth required) ───────────────────────────
router.get('/creators/edit', async (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  const { getProfileByEmail } = require('../db/profiles');
  const { getUserIdByEmail, getDiscordLinkByUserId } = require('../db/discord');
  const { getUserMembership } = require('../db/memberships');
  const email = req.session.userEmail;
  const [profile, userId, membership] = await Promise.all([
    getProfileByEmail(email).catch(() => null),
    getUserIdByEmail(email).catch(() => null),
    getUserMembership(email).catch(() => null),
  ]);
  const discordLink = userId ? await getDiscordLinkByUserId(userId).catch(() => null) : null;
  const currentTier = membership?.plan_slug || 'free';
  res.render('pages/profile-edit', {
    userEmail: email,
    profile: profile || {},
    discordLink: discordLink || null,
    discordFlash: req.query.discord || null,
    currentTier,
  });
});

// ── Onboarding ──────────────────────────────────────────────────────────────
router.get('/onboarding', (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  res.render('pages/onboarding', { email: req.session.userEmail });
});

// ── Terms ────────────────────────────────────────────────────────────────────
router.get('/terms', (_req, res) => res.render('pages/terms'));

// ── Privacy ──────────────────────────────────────────────────────────────────
router.get('/privacy', (_req, res) => res.render('pages/privacy'));

// ── Memberships / pricing tiers ─────────────────────────────────────────────
router.get('/memberships', async (req, res) => {
  const { pool } = require('../db/index');
  const email = req.session?.userEmail;
  let currentMembership = null;
  if (email) {
    const { getUserMembership } = require('../db/memberships');
    currentMembership = await getUserMembership(email).catch(() => null);
  }
  const plans = await pool.query(
    'SELECT slug, name, display_price, price_cents, description, features FROM membership_plans WHERE is_active = true ORDER BY sort_order'
  ).catch(() => ({ rows: [] }));
  const { SUBSCRIPTION_LINKS_MONTHLY, SUBSCRIPTION_LINKS_ANNUAL } = require('../lib/stripe-config');
  res.render('pages/memberships', {
    plans: plans.rows,
    currentMembership,
    success: req.query.success === '1',
    canceled: req.query.canceled === '1',
    upgrade: req.query.upgrade || null,
    userEmail: email,
    subscriptionLinksMonthly: SUBSCRIPTION_LINKS_MONTHLY,
    subscriptionLinksAnnual: SUBSCRIPTION_LINKS_ANNUAL,
  });
});

// ── Subscriptions ─────────────────────────────────────────────────────────────
router.get('/subscriptions', (_req, res) => res.render('pages/subscriptions'));

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
  res.render('pages/admin-users', { userEmail: req.session.userEmail });
});
router.get('/admin/shop', (req, res) => {
  if (!req.session?.userEmail) return res.redirect('/login');
  res.render('pages/admin-shop', { userEmail: req.session.userEmail });
});

// ── Merch ────────────────────────────────────────────────────────────────────
router.get('/merch', async (_req, res) => {
  const items = await getActiveItems().catch(() => []);
  res.render('pages/merch', { items });
});

// ── Live streams ─────────────────────────────────────────────────────────────
router.get('/live', async (req, res) => {
  const streams = await getAllStreams().catch(() => []);
  const email = req.session?.userEmail;
  let canUseAutoclipper = false;
  if (email) {
    const access = await getMemberAccess(email);
    const allowed = new Set(['superadmin','admin','manager','staff','helper','user']);
    canUseAutoclipper = allowed.has(access.role) && access.role !== 'banned';
  }
  res.render('pages/live', { streams, canUseAutoclipper });
});

// ── Creator directory ─────────────────────────────────────────────────────────
router.get('/directory', async (req, res) => {
  const entries = await getPublicDirectory().catch(() => []);
  const email = req.session?.userEmail;
  res.render('pages/directory', { entries, userEmail: email });
});

// Alias for /creators
router.get('/creators', async (req, res) => {
  const entries = await getPublicDirectory().catch(() => []);
  const email = req.session?.userEmail;
  res.render('pages/directory', { entries, userEmail: email });
});

// ── Blog/news ─────────────────────────────────────────────────────────────────
router.get('/news', async (req, res) => {
  const posts = await getPublishedPosts().catch(() => []);
  const email = req.session?.userEmail;
  let canPost = false;
  if (email) {
    const access = await getMemberAccess(email);
    const allowed = new Set(['superadmin','admin','manager','staff','helper','user']);
    canPost = allowed.has(access.role) && access.role !== 'banned';
  }
  res.render('pages/news', { posts, canPost });
});

// ── FAQ ──────────────────────────────────────────────────────────────────────
router.get('/faq', async (_req, res) => {
  const { getActiveFaqs } = require('../db/faq');
  const faqs = await getActiveFaqs().catch(() => []);
  res.render('pages/faq', { faqs });
});

// ── Supabase diagnostic page (no auth required) ──────────────────────────────
router.get('/supabase-test', (_req, res) => {
  res.render('pages/supabase-test');
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

// ── Public creator profile (/creators/:username) ────────────────────────────
router.get('/creators/:username', (req, res) => {
  const username = req.params.username;
  getPublicProfileByUsername(username)
    .then(profile => {
      if (!profile) return res.status(404).render('pages/profile-not-found', { username });
      res.render('pages/profile', { profile, userEmail: req.session?.userEmail });
    })
    .catch(() => res.status(500).render('pages/profile-not-found', { username }));
});

module.exports = router;