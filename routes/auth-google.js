// routes/auth-google.js — Google OAuth login + account linking.
// Owns: GET /auth/google (redirect to Google), GET /auth/google/callback (exchange + session).
// Does NOT own: auth_users table management (db/users.js), session config (server.js).
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { upsertConnection, getByProviderUserId } = require('../db/oauth-providers');
const { getUserByEmail, upsertUser } = require('../db/users');

// Production domain — Google OAuth callback registered as https://wagesociety.com/auth/google/callback
const BASE_URL = process.env.APP_URL || 'https://wagesociety.com';

const GOOGLE_OAUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL  = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
// YouTube scope required for channel listing + livestream integration
const SCOPES = 'openid profile email https://www.googleapis.com/auth/youtube.readonly';

// ── HTTPS helpers (no extra deps) ────────────────────────────────────────────
function httpsPost(url, data) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(data).toString();
    const { hostname, pathname } = new URL(url);
    const req = require('https').request(
      { hostname, path: pathname, method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded',
                   'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let raw = '';
        res.on('data', c => { raw += c; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch (e) { reject(new Error('Non-JSON response from Google token endpoint')); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGet(url, accessToken) {
  return new Promise((resolve, reject) => {
    const { hostname, pathname } = new URL(url);
    const req = require('https').request(
      { hostname, path: pathname, method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` } },
      (res) => {
        let raw = '';
        res.on('data', c => { raw += c; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch (e) { reject(new Error('Non-JSON response from Google userinfo')); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// ── Session helper (mirrors auth-custom.js pattern) ──────────────────────────
function setUserSession(req, user) {
  return new Promise((resolve) => {
    req.session.regenerate((err) => {
      if (err) console.error('[auth-google] session regenerate error:', err);
      req.session.userId = user.id;
      req.session.userEmail = user.email;
      req.session.userRole = user.role || 'member';
      req.session.userTier = user.tier || 'FREE';
      req.session.save((saveErr) => {
        if (saveErr) console.error('[auth-google] session save error:', saveErr);
        resolve();
      });
    });
  });
}

// ── GET /auth/google — redirect to Google consent screen ────────────────────
router.get('/', async (req, res) => {
  // Determine mode: if logged in, we're linking (not signing up/in)
  const linkMode = !!req.session?.userId;
  const state = crypto.randomBytes(20).toString('hex');
  req.session.googleOAuthState = state;
  // Store the return path after callback (for link mode)
  const returnTo = linkMode ? (req.query.return || '/profile/edit') : (req.session.returnTo || '/dashboard');
  req.session.oauthReturnTo = returnTo;

  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  `${BASE_URL}/auth/google/callback`,
    response_type: 'code',
    scope:         SCOPES,
    state,
    access_type:   'offline',
    prompt:        'consent',  // Always force consent to guarantee refresh_token
  });

  // Wait for session to persist before redirecting to Google so the
  // state value is available when the OAuth callback arrives moments later.
  await new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) reject(err); else resolve();
    });
  });
  res.redirect(`${GOOGLE_OAUTH_URL}?${params}`);
});

// ── GET /auth/google/callback ─────────────────────────────────────────────────
router.get('/callback', async (req, res) => {
  const { code, state, error: googleError } = req.query;

  if (googleError) {
    console.error(JSON.stringify({ event: 'google_oauth_denied', error: googleError }));
    return res.redirect('/login?error=google_denied');
  }

  if (!state || state !== req.session.googleOAuthState) {
    console.error(JSON.stringify({ event: 'google_oauth_bad_state', got: state }));
    return res.redirect('/login?error=google_state_invalid');
  }
  delete req.session.googleOAuthState;

  if (!code) {
    return res.redirect('/login?error=google_no_code');
  }

  const returnTo = req.session.oauthReturnTo || '/dashboard';
  delete req.session.oauthReturnTo;

  try {
    // Exchange code for tokens
    const tokenRes = await httpsPost(GOOGLE_TOKEN_URL, {
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type:    'authorization_code',
      code,
      redirect_uri:  `${BASE_URL}/auth/google/callback`,
    });

    if (tokenRes.status !== 200) {
      console.error(JSON.stringify({ event: 'google_token_error', status: tokenRes.status, body: tokenRes.body }));
      return res.redirect(`${returnTo}?error=google_token_failed`);
    }

    const { access_token, refresh_token, expires_in } = tokenRes.body;

    // Fetch user info
    const userRes = await httpsGet(GOOGLE_USERINFO_URL, access_token);
    if (userRes.status !== 200) {
      console.error(JSON.stringify({ event: 'google_userinfo_error', status: userRes.status }));
      return res.redirect(`${returnTo}?error=google_userinfo_failed`);
    }

    const googleUser = userRes.body;
    const providerUserId = googleUser.sub;
    const email = googleUser.email;
    const displayName = googleUser.name || email.split('@')[0];
    const avatarUrl = googleUser.picture || null;
    const tokenExpiresAt = expires_in ? new Date(Date.now() + expires_in * 1000) : null;

    // Determine if this is a link flow (user already logged in) or login/signup flow
    const existingUserId = req.session.userId;

    if (existingUserId && email) {
      // LINK mode: link Google account to already-logged-in user
      await upsertConnection({
        userId: existingUserId,
        provider: 'google',
        providerUserId,
        email,
        displayName,
        avatarUrl,
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt,
      });

      console.log(JSON.stringify({ event: 'google_link_ok', user_id: existingUserId, email }));
      return res.redirect(`${returnTo}?google=linked`);
    }

    // LOGIN/SIGNUP mode: find or create account
    // 1. Check if this Google account is already linked to a user
    const existingConnection = await getByProviderUserId('google', providerUserId);

    if (existingConnection) {
      // Returning user — log them in via their existing auth_users row
      const user = await require('../db/users').getUserById(existingConnection.user_id);
      if (user) {
        await setUserSession(req, user);
        req.session.showTrialPrompt = true;
        return res.redirect(returnTo);
      }
    }

    // 2. Check if email already has an account
    if (email) {
      const existingAccount = await getUserByEmail(email);
      if (existingAccount) {
        // Link Google to existing account, log user in
        await upsertConnection({
          userId: existingAccount.id,
          provider: 'google',
          providerUserId,
          email,
          displayName,
          avatarUrl,
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt,
        });
        await setUserSession(req, existingAccount);
        req.session.showTrialPrompt = true;
        console.log(JSON.stringify({ event: 'google_link_existing_ok', user_id: existingAccount.id, email }));
        return res.redirect(returnTo);
      }
    }

    // 3. New user — create auth_users row + OAuth connection
    const newUser = await upsertUser({
      email,
      displayName,
      avatarUrl,
      externalAuthId: providerUserId,
      externalProvider: 'google',
    });

    await upsertConnection({
      userId: newUser.id,
      provider: 'google',
      providerUserId,
      email,
      displayName,
      avatarUrl,
      accessToken: access_token,
      refreshToken: refresh_token,
      tokenExpiresAt,
    });

    await setUserSession(req, newUser);
    req.session.showTrialPrompt = true;
    console.log(JSON.stringify({ event: 'google_signup_ok', user_id: newUser.id, email }));

    // First-time Google users should fill in profile
    res.redirect('/onboarding');
  } catch (err) {
    console.error('[auth-google/callback]', err);
    res.redirect(`${returnTo}?error=google_oauth_error`);
  }
});

// ── POST /auth/google/unlink — remove Google link from account ──────────────
router.post('/unlink', async (req, res) => {
  if (!req.session?.userId) return res.redirect('/login');

  const { deleteConnection } = require('../db/oauth-providers');
  try {
    await deleteConnection(req.session.userId, 'google');
    console.log(JSON.stringify({ event: 'google_unlink_ok', user_id: req.session.userId }));
  } catch (err) {
    console.error('[auth-google/unlink]', err);
  }
  res.redirect('/settings?google=unlinked');
});

// ── GET /auth/google/unlink — GET fallback ───────────────────────────────────
router.get('/unlink', (req, res) => {
  if (!req.session?.userId) return res.redirect('/login');
  res.redirect('/settings?google=unlinked');
});

module.exports = router;