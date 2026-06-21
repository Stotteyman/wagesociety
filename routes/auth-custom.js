// routes/auth-custom.js — Self-contained email/password + magic link auth.
// Owns: POST /auth/signup, POST /auth/login, POST /auth/magic-link,
//       GET /auth/verify, POST /auth/logout.
// Does NOT own: Supabase auth (commented out in routes/auth.js),
//               session config (server.js), user provisioning (lib/auth.js).
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const {
  getUserByEmail,
  getUserById,
  createUser,
  setMagicLinkToken,
  consumeMagicLink,
  consumeAdminResetToken,
  setUserPassword,
} = require('../db/users');
const { pool } = require('../db/index');
const { upsertProfile } = require('../db/profiles');

const APP_URL = process.env.APP_URL || 'https://wagesociety.com';

// ── Zoho SMTP transporter (reuses existing ZOHO_SMTP_* env vars) ───────────────
// Port 465 → implicit SSL (secure: true)
// Port 587  → STARTTLS (secure: false, upgrade after connect)
// Port 587 with secure=true is invalid; port 465 with secure=false hangs.
const SMTP_PORT = Number(process.env.ZOHO_SMTP_PORT) || 465;
const SMTP_SECURE = SMTP_PORT === 465;

let mailTransport = null;
if (process.env.ZOHO_SMTP_USER && process.env.ZOHO_SMTP_PASS) {
  const port = Number(process.env.ZOHO_SMTP_PORT) || 465;
  mailTransport = nodemailer.createTransport({
    host: process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com',
    port,
    // Zoho: use STARTTLS on 587 (recommended), SSL on 465 (legacy)
    secure: port === 465,            // true for 465 (implicit SSL), false for 587 (STARTTLS)
    requireTLS: port === 587,        // force STARTTLS upgrade on 587
    auth: {
      user: process.env.ZOHO_SMTP_USER,
      pass: process.env.ZOHO_SMTP_PASS,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    tls: {
      // Zoho requires TLS 1.2 minimum; reject legacy ciphers.
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    },
  });
  console.log(`[auth-custom] Mail transport initialized — user: ${process.env.ZOHO_SMTP_USER} | port: ${SMTP_PORT} | secure: ${SMTP_SECURE}`);
} else {
  console.log('[auth-custom] No ZOHO_SMTP credentials — magic link emails will NOT be sent. Set ZOHO_SMTP_USER and ZOHO_SMTP_PASS env vars.');
}

// ── In-process rate limiter (auth endpoints) ──────────────────────────────────
const authAttempts = new Map();
const AUTH_WINDOW_MS = 60 * 1000;
// Stricter per-hour limit for signups (3/hour)
const signupIpTracker = new Map();
const SIGNUP_HOUR_MS = 60 * 60 * 1000;

function checkRateLimit(key, maxPerWindow) {
  const now = Date.now();
  const entry = authAttempts.get(key);
  if (!entry || now - entry.windowStart > AUTH_WINDOW_MS) {
    authAttempts.set(key, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > maxPerWindow;
}

// Strict signup rate limit: max 3 per IP per hour
function checkSignupRateLimit(ip) {
  const now = Date.now();
  const entry = signupIpTracker.get(ip);
  if (!entry || now - entry.windowStart > SIGNUP_HOUR_MS) {
    signupIpTracker.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > 3;
}

setInterval(() => {
  const cutoff = Date.now() - AUTH_WINDOW_MS;
  for (const [k, v] of authAttempts) {
    if (v.windowStart < cutoff) authAttempts.delete(k);
  }
}, 10 * 60 * 1000);

// ── Safe redirect guard ───────────────────────────────────────────────────────
function isSafeRedirect(url) {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('/') || url.startsWith('//')) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return false;
  return true;
}

// ── Session helpers ───────────────────────────────────────────────────────────
function setUserSession(req, user) {
  return new Promise((resolve) => {
    req.session.regenerate((err) => {
      if (err) console.error('[auth-custom] session regenerate error:', err);
      req.session.userId = user.id;
      req.session.userEmail = user.email;
      req.session.userRole = user.role || 'member';
      req.session.userTier = user.tier || 'FREE';
      req.session.save((saveErr) => {
        if (saveErr) console.error('[auth-custom] session save error:', saveErr);
        resolve();
      });
    });
  });
}

function setUidCookie(res, email) {
  res.cookie('uid', email, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearUidCookie(res) {
  res.clearCookie('uid', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });
}

// ── POST /auth/signup  body: { email, password, referral_code? } ───────────────
router.post('/signup', async (req, res) => {
  const { email, password, referral_code } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (checkRateLimit(`signup:${ip}`, 10)) {
    return res.status(429).json({ error: 'Too many requests. Please wait and try again.' });
  }
  // Anti-abuse: strict 3 signups per IP per hour
  if (checkSignupRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many signups from this location. Try again later.' });
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return res.status(400).json({ error: 'Email already registered. Try signing in.' });
  }

  // Resolve referred_by: find the referrer by referral_code
  let referredBy = null;
  let shouldFlag = false;
  if (referral_code && typeof referral_code === 'string') {
    const referrer = await pool.query(
      `SELECT id, email FROM auth_users WHERE referral_code = $1 LIMIT 1`,
      [referral_code.toUpperCase().trim()]
    );
    if (referrer.rows.length > 0) {
      const referrerId = referrer.rows[0].id;
      const referrerEmail = referrer.rows[0].email;

      // Block self-referral (same email address)
      if (referrerEmail.toLowerCase().trim() === email.toLowerCase().trim()) {
        return res.status(400).json({ error: 'You cannot use your own referral code.' });
      }

      // Anti-abuse: same-domain rapid referral — flag for review
      const referrerDomain = referrerEmail.split('@')[1];
      const newUserDomain = email.split('@')[1];
      if (referrerDomain === newUserDomain) {
        const windowStart = new Date(Date.now() - 60 * 60 * 1000);
        const recent = await pool.query(
          `SELECT 1 FROM auth_users WHERE id = $1 AND created_at >= $2`,
          [referrerId, windowStart]
        );
        shouldFlag = recent.rows.length > 0;
      }

      referredBy = referrerId;
    }
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const displayName = email.split('@')[0];
    const user = await createUser({ email, passwordHash, displayName, referredBy });

    // Create member_profiles row so user appears in Creator Directory
    await upsertProfile(email, { display_name: displayName }).catch(err => {
      console.error('[auth-custom/signup] upsertProfile error:', err.message);
    });

    // Self-referral protection
    if (referredBy && referredBy === user.id) {
      console.warn('[auth-custom/signup] Self-referral blocked — user id matched referrer id');
    } else if (referredBy) {
      // Create a referral record (status: pending — rewards come after email verification)
      await pool.query(
        `INSERT INTO referrals (referrer_id, referred_user_id, status, flagged)
         VALUES ($1, $2, 'pending', $3)
         ON CONFLICT DO NOTHING`,
        [referredBy, user.id, shouldFlag]
      );
      // Award referrer 100 points for signup
      const { awardPoints } = require('../db/referrals');
      await awardPoints(referredBy, 100, 'referral_signup', 'Referred user signed up');
    }

    await setUserSession(req, user);
    setUidCookie(res, user.email);

    // Clear referral code from session and cookie
    req.session.referral_code = null;
    res.clearCookie('referral_code');

    // Flag to show the post-signup trial upgrade prompt (shown once)
    req.session.showTrialPrompt = true;

    // New signups → welcome-upgrade page (tier selection before dashboard)
    const returnTo = isSafeRedirect(req.session.returnTo) ? req.session.returnTo : '/welcome-upgrade';
    res.json({ ok: true, redirect: returnTo });
  } catch (err) {
    console.error('[auth-custom/signup] error:', err);
    res.status(500).json({ error: 'Failed to create account. Try again.' });
  }
});

// ── POST /auth/login  body: { email, password } ───────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (checkRateLimit(`signin:${ip}`, 20) || checkRateLimit(`signin:email:${email.toLowerCase()}`, 10)) {
    return res.status(429).json({ error: 'Too many sign-in attempts. Please wait and try again.' });
  }

  const user = await getUserByEmail(email);
  if (!user || !user.password_hash) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  await setUserSession(req, user);
  setUidCookie(res, user.email);
  req.session.showTrialPrompt = true;

  const returnTo = isSafeRedirect(req.session.returnTo) ? req.session.returnTo : '/dashboard';
  res.json({ ok: true, redirect: returnTo });
});

// ── POST /auth/magic-link  body: { email } ───────────────────────────────────
router.post('/magic-link', async (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  if (checkRateLimit(`magic:${email.toLowerCase()}`, 3)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  }

  const user = await getUserByEmail(email);

  // Always return success to the user — don't reveal whether email exists.
  // This prevents email enumeration.
  res.json({ ok: true });

  if (!user || !user.password_hash) {
    // Non-existent user or user without password — do not send email.
    // Silently succeed from user's perspective.
    return;
  }

  // Generate a secure random token (32 bytes hex = 64 chars)
  const token = crypto.randomBytes(32).toString('hex');

  await setMagicLinkToken(email, token);

  const verifyUrl = `${APP_URL}/auth/verify?token=${token}`;

  if (mailTransport) {
    try {
      const info = await mailTransport.sendMail({
        from: '"W.A.G.E. Society" <hello@wagesociety.com>',
        to: email,
        subject: 'Your Wage Society login link',
        text: `Click to sign in: ${verifyUrl}\n\nThis link expires in 15 minutes.\n\nIf you didn't request this, you can safely ignore this email.`,
        html: `<p>Click to sign in:</p>
<p><a href="${verifyUrl}">${verifyUrl}</a></p>
<p style="font-size:0.85rem;color:#666">This link expires in 15 minutes.<br>If you didn't request this, you can safely ignore this email.</p>`,
      });
      console.log(`[auth-custom/magic-link] Email sent to ${email} — messageId: ${info.messageId}`);
    } catch (err) {
      console.error('[auth-custom/magic-link] email error:', err.message, err.code);
    }
  } else {
    console.log(`[auth-custom/magic-link] No mail transport — link would be: ${verifyUrl}`);
  }
});

// ── GET /auth/verify?token=xxx ────────────────────────────────────────────────
// Regular magic link — logs user in immediately.
// Also triggers referral reward processing for newly-verified users.
router.get('/verify', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.redirect('/login?error=no_token');
  }

  const user = await consumeMagicLink(token);

  if (!user) {
    return res.redirect('/login?error=link_expired');
  }

  await setUserSession(req, user);
  setUidCookie(res, user.email);
  req.session.showTrialPrompt = true;

  // Process referral: award points to both referrer and newly-verified user
  const { processVerifiedReferral } = require('../db/referrals');
  processVerifiedReferral(user.id).catch(err => {
    console.error('[auth-custom/verify] referral processing error:', err.message);
  });

  const returnTo = isSafeRedirect(req.session.returnTo) ? req.session.returnTo : '/dashboard';
  res.redirect(returnTo);
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  clearUidCookie(res);
  req.session.destroy((err) => {
    if (err) console.error('[auth-custom/logout]', err);
    res.redirect('/login');
  });
});

// GET fallback for logout (from old auth links)
router.get('/logout', (req, res) => {
  clearUidCookie(res);
  req.session.destroy((err) => {
    if (err) console.error('[auth-custom/logout]', err);
    res.redirect('/');
  });
});

// ── GET /auth/reset-password?token=xxx — show reset form ─────────────────────
router.get('/reset-password', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/login?error=no_token');

  const user = await consumeAdminResetToken(token);
  if (!user) return res.redirect('/login?error=link_expired');

  res.render('pages/reset-password', { token, email: user.email });
});

// ── POST /auth/reset-password — set new password from admin-initiated reset ───
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) return res.status(400).json({ error: 'token and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const user = await consumeAdminResetToken(token);
  if (!user) return res.status(400).json({ error: 'Link expired or already used' });

  try {
    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash(password, 12);
    await setUserPassword(user.email, passwordHash);

    // Auto-login the user after password reset
    await setUserSession(req, user);
    setUidCookie(res, user.email);

    res.json({ ok: true, redirect: '/dashboard' });
  } catch (err) {
    console.error('[auth-custom/reset-password POST]', err);
    res.status(500).json({ error: 'Failed to reset password. Try again.' });
  }
});

module.exports = router;

// ── GET /auth/test-email — debug endpoint to verify SMTP is working ──────────
// Admin-only: requires active session with admin role. No PII exposed in response.
router.get('/test-email', async (req, res) => {
  // Guard: must be logged in as admin
  if (!req.session?.userId || !['admin', 'superadmin'].includes(req.session?.userRole)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const recipient = process.env.SUPERADMIN_EMAIL;
  if (!recipient) {
    return res.status(503).json({ error: 'SUPERADMIN_EMAIL env var not set' });
  }

  if (!mailTransport) {
    return res.status(503).json({
      error: 'Mail transport not configured',
      hint: 'Set ZOHO_SMTP_USER and ZOHO_SMTP_PASS env vars',
      configured: false,
    });
  }

  try {
    const info = await mailTransport.sendMail({
      from: '"W.A.G.E. Society" <hello@wagesociety.com>',
      to: recipient,
      subject: '[DEBUG] WAGE Society SMTP test',
      text: 'SMTP test successful. If you received this, the mail transport is working.',
      html: '<p>SMTP test successful. If you received this, the mail transport is working.</p>',
    });

    console.log('[auth-custom/test-email] SMTP test sent — messageId:', info.messageId);
    // Don't echo the recipient address in the response to avoid PII leak via API
    res.json({ ok: true, messageId: info.messageId });
  } catch (err) {
    console.error('[auth-custom/test-email] SMTP test failed:', err.message, err.code);
    res.status(500).json({
      error: err.message,
      code: err.code,
      hint: 'Check Zoho SMTP credentials and account status',
    });
  }
});