// routes/auth.js — Supabase Auth routes: magic link, email+password, PKCE verify, logout.
// Owns: POST /auth/magic-link, POST /auth/signup, POST /auth/signin, GET /auth/verify,
//       GET /auth/v1/callback, GET /auth/logout.
// Does NOT own session config (server.js) or user provisioning (lib/auth.js).
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const { onFirstOAuthLogin } = require('../lib/auth');
const { getProfileEmailByUsername } = require('../db/profiles');

function getSupabase() {
  // Node.js 20 lacks native WebSocket; pass the ws package as transport so
  // @supabase/realtime-js doesn't throw on createClient().
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { realtime: { transport: ws } }
  );
}

const APP_URL = process.env.APP_URL || 'https://ai.wagesociety.com';

// ── In-process magic-link rate limiter ───────────────────────────────────────
// Supabase enforces its own OTP rate limit, but we block repeated requests
// server-side before they reach Supabase to avoid noisy error logs and
// prevent email enumeration via timing differences.
// Map: email → { count, windowStart }
const magicLinkAttempts = new Map();
const ML_WINDOW_MS = 60 * 1000;  // 1-minute window
const ML_MAX_PER_WINDOW = 3;      // 3 requests per email per minute

function checkMagicLinkRateLimit(email) {
  const now = Date.now();
  const key = email.toLowerCase();
  const entry = magicLinkAttempts.get(key);
  if (!entry || now - entry.windowStart > ML_WINDOW_MS) {
    magicLinkAttempts.set(key, { count: 1, windowStart: now });
    return false; // not rate-limited
  }
  entry.count += 1;
  return entry.count > ML_MAX_PER_WINDOW;
}

// Prune stale entries every 10 minutes to prevent unbounded memory growth.
setInterval(() => {
  const cutoff = Date.now() - ML_WINDOW_MS;
  for (const [k, v] of magicLinkAttempts) {
    if (v.windowStart < cutoff) magicLinkAttempts.delete(k);
  }
}, 10 * 60 * 1000);

// ── Send magic link ──────────────────────────────────────────────────────────
// POST /auth/magic-link  body: { email }
// Calls supabase.auth.signInWithOtp — creates user if they don't exist.
router.post('/magic-link', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  if (checkMagicLinkRateLimit(email)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  }

  const supabase = getSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.toLowerCase().trim(),
    options: {
      emailRedirectTo: `${APP_URL}/auth/callback`,
      // OTP lifetime: 300s (5 min) instead of default 60s.
      // Email delivery delays can eat into the window.
     otpLifetime: 300,
      // shouldCreateUser defaults to true — creates account if new email
    },
  });

  if (error) {
    console.error('[magic-link] OTP error:', error.message);
    // Surface Supabase rate-limit message so users understand what's happening
    const msg = error.message.toLowerCase().includes('rate limit')
      ? 'Too many requests. Please wait a minute and try again.'
      : 'Failed to send login link. Try again.';
    return res.status(429).json({ error: msg });
  }

  res.json({ ok: true });
});

// ── Verify magic link / OAuth PKCE callback ──────────────────────────────────
// Two distinct flows arrive here via redirect from Supabase:
//
// 1. Magic link:  GET /auth/verify?token_hash=<hash>&type=email&redirect_to=/dashboard
//    Uses supabase.auth.verifyOtp() with the token_hash from the URL.
//    The token_hash param is Supabase's magic link identifier (NOT a PKCE code).
//
// 2. OAuth PKCE:  GET /auth/verify?code=<pkce_code>&provider=<google|discord>
//    Uses supabase.auth.exchangeCodeForSession() with the code from the URL.
//    The ?code= param is a PKCE authorization code (NOT a token_hash).
//
// 3. Non-PKCE fallback: No token_hash/code in query; extract tokens from Referer
//    header hash fragment (legacy Supabase behavior).
//
// All flows: set Express session → /dashboard.
router.get('/verify', async (req, res) => {
  const { token_hash, code, error: oauthError, provider, type, ...rest } = req.query;
  console.log('[auth/verify] query params:', JSON.stringify(req.query));

  if (oauthError) {
    console.error('[auth/verify] Supabase error param:', oauthError);
    return res.redirect(`/login?error=${encodeURIComponent(oauthError)}`);
  }

  const supabase = getSupabase();

  try {
    let user;
    let supabaseAccessToken = null;
    let supabaseRefreshToken = null;

    // ── Magic link flow ──────────────────────────────────────────────────────
    // Supabase magic links redirect with ?token_hash=xxx&type=email.
    // The token_hash is a one-time token, NOT a PKCE authorization code.
    // Use verifyOtp() for magic link tokens — exchangeCodeForSession is wrong here.
    // verifyOtp handles the token_hash directly, no redirect URL needed.
    if (token_hash && type === 'email') {
      console.log('[auth/verify] magic link — using verifyOtp');
      const { data, error } = await supabase.auth.verifyOtp({
        email: '', // token_hash is self-contained — Supabase uses it directly
        type: 'email',
        token_hash: token_hash,
      });
      if (error) {
        console.error('[auth/verify] verifyOtp error:', error.message);
        return res.redirect(`/login?error=${encodeURIComponent(error.message)}`);
      }
      user = data.user;
      if (data.session) {
        supabaseAccessToken = data.session.access_token;
        supabaseRefreshToken = data.session.refresh_token;
      }

    // ── OAuth PKCE flow ──────────────────────────────────────────────────────
    // OAuth uses ?code= (PKCE authorization code). Use exchangeCodeForSession().
    } else if (code) {
      const fullRedirectUrl = `${APP_URL}${req.path}?code=${code}${provider ? `&provider=${provider}` : ''}`;
      const { data, error } = await supabase.auth.exchangeCodeForSession(fullRedirectUrl);
      if (error) {
        console.error('[auth/verify] exchangeCodeForSession error:', error.message, '| provider:', provider);
        return res.redirect(`/login?error=${encodeURIComponent(error.message)}`);
      }
      user = data.user;
      if (data.session) {
        supabaseAccessToken = data.session.access_token;
        supabaseRefreshToken = data.session.refresh_token;
      }

    // ── Non-PKCE fallback ───────────────────────────────────────────────────
    // No token_hash or code in query. Try extracting tokens from Referer hash.
    } else {
      const referer = req.get('Referer') || '';
      const hashStart = referer.indexOf('#');
      if (hashStart === -1) {
        console.error('[auth/verify] No token_hash/code in query and no hash in Referer');
        return res.redirect('/login?error=no_link_code');
      }
      const hashParams = new URLSearchParams(referer.slice(hashStart + 1));
      const access_token  = hashParams.get('access_token');
      const refresh_token = hashParams.get('refresh_token') || '';
      if (!access_token) {
        console.error('[auth/verify] No access_token in Referer hash');
        return res.redirect('/login?error=no_link_code');
      }
      const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) {
        console.error('[auth/verify] setSession error:', error.message);
        return res.redirect(`/login?error=${encodeURIComponent(error.message)}`);
      }
      user = data.user;
      supabaseAccessToken = access_token;
      supabaseRefreshToken = refresh_token;
    }

    if (!user || !user.email) {
      return res.redirect('/login?error=no_user');
    }

    // Provision user in Neon (idempotent — safe to call on every login)
    const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0];
    const avatarUrl = user.user_metadata?.avatar_url || null;
    await onFirstOAuthLogin({ email: user.email, name, avatarUrl, role: 'user' });

    // Regenerate session ID to prevent session fixation.
    const returnTo = req.session.returnTo || '/dashboard';
    req.session.regenerate((regenErr) => {
      if (regenErr) console.error('[auth/verify] session regenerate error:', regenErr);
      req.session.userEmail = user.email;
      if (supabaseAccessToken) {
        req.session.supabaseAccessToken = supabaseAccessToken;
        req.session.supabaseRefreshToken = supabaseRefreshToken || '';
      }
      req.session.save((err) => {
        if (err) console.error('[auth/verify] session save error:', err);
        res.redirect(returnTo);
      });
    });
  } catch (err) {
    console.error('[auth/verify] exception:', err.message);
    res.redirect('/login?error=auth_failed');
  }
});

// ── Email + password sign-up ─────────────────────────────────────────────────
// POST /auth/signup  body: { email, password }
// Creates Supabase auth.users row + provisions Neon member_profiles + FREE membership.
router.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signUp({
    email: email.toLowerCase().trim(),
    password,
    options: { emailRedirectTo: `${APP_URL}/auth/callback` },
  });

  if (error) {
    console.error('[auth/signup] error:', error.message);
    const msg = error.message.toLowerCase().includes('already registered')
      ? 'An account with that email already exists. Sign in instead.'
      : error.message;
    return res.status(400).json({ error: msg });
  }

  const user = data.user;
  if (!user) return res.status(400).json({ error: 'Sign-up failed — try again.' });

  // Provision profile + FREE tier immediately (Supabase may still require email confirmation,
  // but we create the Neon row now so the user exists when they verify).
  const name = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0];
  try {
    await onFirstOAuthLogin({ email: user.email, name, avatarUrl: null, role: 'user' });
  } catch (provisionErr) {
    console.error('[auth/signup] provision error:', provisionErr.message);
  }

  // If Supabase email confirmation is disabled, user is fully confirmed — set session.
  if (user.email_confirmed_at || user.confirmed_at) {
    return req.session.regenerate((regenErr) => {
      if (regenErr) console.error('[auth/signup] session regenerate error:', regenErr);
      req.session.userEmail = user.email;
      req.session.save((err) => {
        if (err) console.error('[auth/signup] session save error:', err);
        res.json({ ok: true, redirect: '/dashboard' });
      });
    });
  }

  // Email confirmation required — tell the client.
  res.json({ ok: true, confirm_email: true });
});

// ── Email + password sign-in ─────────────────────────────────────────────────
// POST /auth/signin  body: { email, password }
router.post('/signin', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  if (!password) return res.status(400).json({ error: 'Password required' });

  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.toLowerCase().trim(),
    password,
  });

  if (error) {
    console.error('[auth/signin] error:', error.message);
    const msg = error.message.toLowerCase().includes('invalid login')
      ? 'Incorrect email or password.'
      : error.message;
    return res.status(401).json({ error: msg });
  }

  const user = data.user;
  if (!user || !user.email) return res.status(401).json({ error: 'Sign-in failed — try again.' });

  const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0];
  try {
    await onFirstOAuthLogin({ email: user.email, name, avatarUrl: user.user_metadata?.avatar_url || null, role: 'user' });
  } catch (provisionErr) {
    console.error('[auth/signin] provision error:', provisionErr.message);
  }

  req.session.regenerate((regenErr) => {
    if (regenErr) console.error('[auth/signin] session regenerate error:', regenErr);
    req.session.userEmail = user.email;
    req.session.save((err) => {
      if (err) console.error('[auth/signin] session save error:', err);
      res.json({ ok: true, redirect: '/dashboard' });
    });
  });
});

// ── Token session — non-PKCE fallback for client-side magic link ──────────────
// POST /auth/token-session  body: { access_token, refresh_token }
// Client-side JS calls this after extracting tokens from a hash-fragment magic link
// when no PKCE ?code= is present. Creates an Express session from the Supabase tokens.
router.post('/token-session', async (req, res) => {
  const { access_token, refresh_token } = req.body;
  if (!access_token) return res.status(400).json({ error: 'access_token required' });

  const supabase = getSupabase();
  try {
    const { data, error } = await supabase.auth.setSession({ access_token, refresh_token: refresh_token || '' });
    if (error || !data.user?.email) {
      console.error('[auth/token-session] setSession error:', error?.message || 'no user');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = data.user;
    const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0];
    const avatarUrl = user.user_metadata?.avatar_url || null;
    await onFirstOAuthLogin({ email: user.email, name, avatarUrl, role: 'user' });

    req.session.regenerate((regenErr) => {
      if (regenErr) console.error('[auth/token-session] session regenerate error:', regenErr);
      req.session.userEmail = user.email;
      req.session.save((err) => {
        if (err) console.error('[auth/token-session] session save error:', err);
        res.json({ ok: true, redirect: '/dashboard' });
      });
    });
  } catch (err) {
    console.error('[auth/token-session] exception:', err.message);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// ── Session creation from client-side PKCE exchange ──────────────────────────
// POST /auth/session  body: { access_token, refresh_token }
// Called by auth-callback.ejs after the Supabase JS SDK exchanges the PKCE code
// client-side. Validates the access_token against Supabase, provisions the user
// in Neon, and creates an Express session.
router.post('/session', async (req, res) => {
  const { access_token, refresh_token } = req.body;
  if (!access_token) return res.status(400).json({ error: 'access_token required' });

  const supabase = getSupabase();
  try {
    const { data, error } = await supabase.auth.getUser(access_token);
    if (error || !data.user?.email) {
      console.error('[auth/session] getUser error:', error?.message || 'no user');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = data.user;
    const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0];
    const avatarUrl = user.user_metadata?.avatar_url || null;
    await onFirstOAuthLogin({ email: user.email, name, avatarUrl, role: 'user' });

    req.session.regenerate((regenErr) => {
      if (regenErr) console.error('[auth/session] session regenerate error:', regenErr);
      req.session.userEmail = user.email;
      req.session.supabaseAccessToken = access_token;
      req.session.supabaseRefreshToken = refresh_token || '';
      req.session.save((err) => {
        if (err) console.error('[auth/session] session save error:', err);
        res.json({ ok: true, redirect: '/dashboard' });
      });
    });
  } catch (err) {
    console.error('[auth/session] exception:', err.message);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// ── PKCE code exchange — called by auth-callback.ejs after manual PKCE ─────────
// POST /auth/exchange  body: { code, code_verifier }
// Exchanges the authorization code + PKCE verifier directly with Supabase via HTTP.
// The code_verifier was generated client-side on the login page and stored in
// localStorage under 'wage_pkce_verifier'. Never transmitted except to this route.
router.post('/exchange', async (req, res) => {
  const { code, code_verifier } = req.body;
  if (!code || !code_verifier) {
    return res.status(400).json({ error: 'code and code_verifier are required' });
  }

  try {
    // Call Supabase token endpoint directly with PKCE parameters.
    // This avoids SDK localStorage dependency — we have the verifier from the client.
    // Supabase requires: Content-Type: application/x-www-form-urlencoded + body as URLSearchParams
    console.log('[auth/exchange] REQUEST: code_len=' + (code ? code.length : 0) + ' verifier_len=' + (code_verifier ? code_verifier.length : 0));

    const tokenResp = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      },
      body: new URLSearchParams({
        code: code,
        code_verifier: code_verifier,
        // No redirect_to — Supabase PKCE token endpoint only needs code + verifier.
        // The redirect_uri was already validated at the authorize step.
      }),
    });

    // Read response as text first, then parse — Supabase returns different shapes
    const rawText = await tokenResp.text();
    console.log('[auth/exchange] SUPABASE STATUS:', tokenResp.status, '| RAW:', rawText.substring(0, 500));

    let tokenData;
    try { tokenData = JSON.parse(rawText); } catch { tokenData = { raw: rawText }; }

    // Supabase returns different shapes depending on error type:
    // HTTP 400: { code, error_code, msg }  (e.g. "both auth code and code verifier should be non-empty")
    // HTTP 4xx: { error: { message: "..." } }
    // HTTP 2xx: { access_token, refresh_token, user, ... }
    let errMsg = null;
    if (tokenData && typeof tokenData === 'object') {
      if (tokenData.msg)       errMsg = tokenData.msg;        // { code, msg } format (HTTP 400)
      else if (tokenData.error && tokenData.error.message) errMsg = tokenData.error.message; // { error: { message } }
      else if (tokenData.error) errMsg = String(tokenData.error); // plain error string
    }

    if (errMsg) {
      console.error('[auth/exchange] token error:', errMsg);
      return res.status(400).json({ error: errMsg });
    }

    const access_token  = tokenData.access_token;
    const refresh_token = tokenData.refresh_token;

    if (!access_token) {
      return res.status(400).json({ error: 'No access token in response' });
    }

    // Validate the token by fetching user info via Supabase server client
    const supabase = getSupabase();
    const { data: userData, error: userErr } = await supabase.auth.getUser(access_token);
    if (userErr || !userData.user?.email) {
      console.error('[auth/exchange] getUser error:', userErr?.message);
      return res.status(401).json({ error: 'Invalid session' });
    }

    const user = userData.user;
    const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0];
    const avatarUrl = user.user_metadata?.avatar_url || null;
    await onFirstOAuthLogin({ email: user.email, name, avatarUrl, role: 'user' });

    req.session.regenerate((regenErr) => {
      if (regenErr) console.error('[auth/exchange] session regenerate error:', regenErr);
      req.session.userEmail = user.email;
      req.session.supabaseAccessToken = access_token;
      req.session.supabaseRefreshToken = refresh_token || '';
      req.session.save((err) => {
        if (err) console.error('[auth/exchange] session save error:', err);
        res.json({ ok: true, redirect: '/dashboard' });
      });
    });
  } catch (err) {
    console.error('[auth/exchange] exception:', err.message);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// ── Supabase PKCE callback — renders client-side exchange page ────────────────
// GET /auth/callback?code=<pkce_code> or ?token_hash=xxx&type=magiclink
//
// The Supabase JS SDK on the login page called signInWithOAuth() which:
//   1. Generated code_verifier and stored it in localStorage
//   2. Computed code_challenge and added it to the authorize URL
//   3. Redirected the user to Supabase → provider → back here with ?code=
//
// This route renders auth-callback.ejs which:
//   - Magic link (token_hash): redirects to server-side /auth/verify (no CDN dependency)
//   - OAuth (code): reads verifier from localStorage, POSTs to /auth/exchange
router.get('/callback', (req, res) => {
  res.render('pages/auth-callback', {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    appUrl: APP_URL,
  });
});

// ── Supabase native PKCE callback route — same client-side exchange ──────────
// GET /auth/v1/callback?code=<pkce_code>
router.get('/v1/callback', (req, res) => {
  res.render('pages/auth-callback', {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    appUrl: APP_URL,
  });
});

// ── Root admin email lookup (for username="root" admin login) ────────────────
router.post('/lookup-root', async (req, res) => {
  try {
    const email = await getProfileEmailByUsername('root');
    if (!email) return res.status(404).json({ error: 'not found' });
    res.json({ email });
  } catch {
    res.status(500).json({ error: 'db error' });
  }
});

// ── Logout ────────────────────────────────────────────────────────────────────
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('[logout]', err);
    res.redirect('/');
  });
});

module.exports = { router };