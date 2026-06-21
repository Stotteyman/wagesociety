// routes/auth-kick.js — Kick OAuth 2.1 login + account linking with PKCE.
// Owns: GET /auth/kick (redirect to Kick), GET /auth/kick/callback (exchange + session).
// Kick uses OAuth 2.1 with PKCE (S256). Auth server: id.kick.com, API: api.kick.com.
// Does NOT own: auth_users table management (db/users.js), session config (server.js).
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { upsertConnection, getByProviderUserId } = require('../db/oauth-providers');
const { upsertStreamByUserId } = require('../db/livestreams');
const { getUserByEmail } = require('../db/users');
const { upsertUser } = require('../db/users');

// Production domain — Kick OAuth callback registered as https://wagesociety.com/auth/kick/callback
const BASE_URL = process.env.APP_URL || 'https://wagesociety.com';

// Kick uses OAuth 2.1 with PKCE on id.kick.com (NOT www.kick.com)
const KICK_AUTH_URL    = 'https://id.kick.com/oauth/authorize';
const KICK_TOKEN_URL   = 'https://id.kick.com/oauth/token';
const KICK_USER_URL    = 'https://api.kick.com/public/v1/users';
const SCOPES = 'user:read channel:read';

function httpsPost(url, data, { useBasicAuth } = {}) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(data).toString();
    const { hostname, pathname } = new URL(url);
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    };
    // Kick OAuth 2.1 per docs: credentials in POST body (not HTTP Basic).
    // useBasicAuth kept as fallback if Kick changes requirements.
    if (useBasicAuth && data.client_id && data.client_secret) {
      headers['Authorization'] = 'Basic ' + Buffer.from(`${data.client_id}:${data.client_secret}`).toString('base64');
    }
    const req = require('https').request(
      { hostname, path: pathname, method: 'POST', headers },
      (res) => {
        let raw = '';
        res.on('data', c => { raw += c; });
        res.on('end', () => {
          if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
            return httpsPost(res.headers.location, data, { useBasicAuth }).then(resolve, reject);
          }
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch (e) {
            console.error(JSON.stringify({ event: 'kick_token_non_json', status: res.statusCode, raw: raw.substring(0, 500) }));
            reject(new Error(`Non-JSON response from Kick token endpoint (HTTP ${res.statusCode}): ${raw.substring(0, 200)}`));
          }
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
          catch (e) { reject(new Error('Non-JSON response from Kick API')); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function setUserSession(req, user) {
  return new Promise((resolve) => {
    req.session.regenerate((err) => {
      if (err) console.error('[auth-kick] session regenerate error:', err);
      req.session.userId = user.id;
      req.session.userEmail = user.email;
      req.session.userRole = user.role || 'member';
      req.session.userTier = user.tier || 'FREE';
      req.session.save((saveErr) => {
        if (saveErr) console.error('[auth-kick] session save error:', saveErr);
        resolve();
      });
    });
  });
}

// ── PKCE helpers (Kick OAuth 2.1 requires S256 code challenge) ──────────────
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}
function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ── GET /auth/kick — redirect to Kick consent screen ─────────────────────────
router.get('/', (req, res) => {
  const linkMode = !!req.session?.userId;
  const state = crypto.randomBytes(20).toString('hex');
  req.session.kickOAuthState = state;
  const returnTo = linkMode ? (req.query.return || '/profile/edit') : (req.session.returnTo || '/dashboard');
  req.session.oauthReturnTo = returnTo;

  // PKCE: generate code_verifier + code_challenge for Kick OAuth 2.1
  const codeVerifier = generateCodeVerifier();
  req.session.kickCodeVerifier = codeVerifier;
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const redirectUri = `${BASE_URL}/auth/kick/callback`;
  const params = new URLSearchParams({
    client_id:             process.env.KICK_CLIENT_ID,
    redirect_uri:          redirectUri,
    response_type:         'code',
    scope:                 SCOPES,
    state,
    code_challenge:        codeChallenge,
    code_challenge_method: 'S256',
  });

  console.error(JSON.stringify({ event: 'kick_auth_start', redirect_uri: redirectUri, base_url: BASE_URL, app_url_env: process.env.APP_URL }));
  req.session.save(() => {
    res.redirect(`${KICK_AUTH_URL}?${params}`);
  });
});

// ── GET /auth/kick/callback ─────────────────────────────────────────────────────
router.get('/callback', async (req, res) => {
  const { code, state, error: kickError } = req.query;

  if (kickError) {
    console.error(JSON.stringify({ event: 'kick_oauth_denied', error: kickError }));
    return res.redirect('/login?error=kick_denied');
  }

  if (!state || state !== req.session.kickOAuthState) {
    console.error(JSON.stringify({ event: 'kick_oauth_bad_state', got: state }));
    return res.redirect('/login?error=kick_state_invalid');
  }
  delete req.session.kickOAuthState;

  if (!code) {
    return res.redirect('/login?error=kick_no_code');
  }

  const returnTo = req.session.oauthReturnTo || '/dashboard';
  delete req.session.oauthReturnTo;

  try {
    // PKCE: retrieve code_verifier from session
    const codeVerifier = req.session.kickCodeVerifier;
    delete req.session.kickCodeVerifier;
    if (!codeVerifier) {
      console.error(JSON.stringify({ event: 'kick_no_code_verifier' }));
      return res.redirect(`${returnTo}?error=kick_session_expired`);
    }

    // Exchange code for tokens — Kick docs: credentials in POST body as form params.
    // https://docs.kick.com/getting-started/generating-tokens-oauth2-flow
    const clientId = process.env.KICK_CLIENT_ID;
    const clientSecret = process.env.KICK_CLIENT_SECRET;
    const redirectUri = `${BASE_URL}/auth/kick/callback`;

    const tokenPayload = {
      grant_type:    'authorization_code',
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      code_verifier: codeVerifier,
    };
    console.error(JSON.stringify({
      event: 'kick_token_request',
      redirect_uri: redirectUri,
      has_client_id: !!clientId,
      has_client_secret: !!clientSecret,
      secret_len: clientSecret?.length || 0,
      code_verifier_len: codeVerifier?.length || 0,
    }));

    let tokenRes;
    try {
      // Try body params first (per Kick docs)
      tokenRes = await httpsPost(KICK_TOKEN_URL, tokenPayload);

      // If body params fail with invalid_client, retry with HTTP Basic auth header
      if (tokenRes.status === 401 && tokenRes.body?.error === 'invalid_client') {
        console.error(JSON.stringify({ event: 'kick_token_body_failed', status: 401, retrying: 'basic_auth' }));
        tokenRes = await httpsPost(KICK_TOKEN_URL, tokenPayload, { useBasicAuth: true });
      }
    } catch (httpsErr) {
      console.error(JSON.stringify({ event: 'kick_token_https_error', message: httpsErr.message }));
      return res.redirect(`${returnTo}?error=kick_token_failed`);
    }

    if (tokenRes.status !== 200) {
      console.error(JSON.stringify({ event: 'kick_token_error', status: tokenRes.status, body: tokenRes.body }));
      // Surface actionable error to help diagnose
      const kickErr = tokenRes.body?.error || 'unknown';
      if (kickErr === 'invalid_client') {
        console.error('[auth-kick] CRITICAL: Kick rejects client credentials. Verify KICK_CLIENT_SECRET on https://kick.com/settings/developer');
      }
      return res.redirect(`${returnTo}?error=kick_token_failed&detail=${encodeURIComponent(kickErr)}`);
    }

    const { access_token, refresh_token, expires_in } = tokenRes.body;

    // Fetch Kick user profile — response is wrapped in { data: [...] }
    const userRes = await httpsGet(KICK_USER_URL, access_token);
    if (userRes.status !== 200) {
      console.error(JSON.stringify({ event: 'kick_user_error', status: userRes.status, body: userRes.body }));
      return res.redirect(`${returnTo}?error=kick_user_fetch_failed`);
    }

    // Kick API wraps users in { data: [...] } array
    const kickUsers = userRes.body?.data || [userRes.body];
    const kickUser = Array.isArray(kickUsers) ? kickUsers[0] : kickUsers;
    if (!kickUser) {
      console.error(JSON.stringify({ event: 'kick_no_user_data', body: userRes.body }));
      return res.redirect(`${returnTo}?error=kick_user_fetch_failed`);
    }
    const providerUserId = String(kickUser.user_id || kickUser.id);
    const username = kickUser.name || kickUser.username || kickUser.slug;
    const email = kickUser.email || null;
    const avatarUrl = kickUser.profile_pic || kickUser.profile_picture || null;
    const displayName = kickUser.display_name || kickUser.name || username;
    const tokenExpiresAt = expires_in ? new Date(Date.now() + expires_in * 1000) : null;

    const existingUserId = req.session.userId;

    if (existingUserId && username) {
      // LINK mode: link Kick account to already-logged-in user
      await upsertConnection({
        userId: existingUserId,
        provider: 'kick',
        providerUserId,
        email: email || `${username}@kick.user`,
        displayName,
        avatarUrl,
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt,
      });

      // Populate the livestreams table so this channel appears on /streams
      await upsertStreamByUserId(existingUserId, {
        platform: 'kick',
        platformChannelId: providerUserId,
        channelName: username,
        streamUrl: `https://kick.com/${username}`,
      }).catch(err => console.error('[auth-kick] stream upsert error:', err));

      console.log(JSON.stringify({ event: 'kick_link_ok', user_id: existingUserId, username }));
      return res.redirect(`${returnTo}?kick=linked`);
    }

    // LOGIN/SIGNUP mode: find or create account
    const existingConnection = await getByProviderUserId('kick', providerUserId);

    if (existingConnection) {
      const user = await require('../db/users').getUserById(existingConnection.user_id);
      if (user) {
        await setUserSession(req, user);
        req.session.showTrialPrompt = true;
        return res.redirect(returnTo);
      }
    }

    // Try to find by email if we have one
    if (email) {
      const existingAccount = await getUserByEmail(email);
      if (existingAccount) {
        await upsertConnection({
          userId: existingAccount.id,
          provider: 'kick',
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
        console.log(JSON.stringify({ event: 'kick_link_existing_ok', user_id: existingAccount.id, username }));
        return res.redirect(returnTo);
      }
    }

    // New user — create auth_users row
    const newUser = await upsertUser({
      email: email || `${username}@kick.user`,
      displayName,
      avatarUrl,
      externalAuthId: providerUserId,
      externalProvider: 'kick',
    });

    await upsertConnection({
      userId: newUser.id,
      provider: 'kick',
      providerUserId,
      email: email || `${username}@kick.user`,
      displayName,
      avatarUrl,
      accessToken: access_token,
      refreshToken: refresh_token,
      tokenExpiresAt,
    });

    // Populate livestreams so this channel appears on /streams
    await upsertStreamByUserId(newUser.id, {
      platform: 'kick',
      platformChannelId: providerUserId,
      channelName: username,
      streamUrl: `https://kick.com/${username}`,
    }).catch(err => console.error('[auth-kick] stream upsert error:', err));

    await setUserSession(req, newUser);
    req.session.showTrialPrompt = true;
    console.log(JSON.stringify({ event: 'kick_signup_ok', user_id: newUser.id, username }));

    res.redirect('/onboarding');
  } catch (err) {
    console.error(JSON.stringify({ event: 'kick_oauth_callback_error', message: err.message, stack: err.stack?.split('\n').slice(0, 3).join(' | ') }));
    res.redirect(`${returnTo}?error=kick_oauth_error`);
  }
});

// ── POST /auth/kick/unlink ────────────────────────────────────────────────────
router.post('/unlink', async (req, res) => {
  if (!req.session?.userId) return res.redirect('/login');

  const { deleteConnection } = require('../db/oauth-providers');
  try {
    await deleteConnection(req.session.userId, 'kick');
    console.log(JSON.stringify({ event: 'kick_unlink_ok', user_id: req.session.userId }));
  } catch (err) {
    console.error('[auth-kick/unlink]', err);
  }
  res.redirect('/settings?kick=unlinked');
});

router.get('/unlink', (req, res) => {
  if (!req.session?.userId) return res.redirect('/login');
  res.redirect('/settings?kick=unlinked');
});

// ── GET /auth/kick/test-creds — diagnostic endpoint to verify client credentials ──
// Tests both body params and HTTP Basic auth so we can see which (if any) Kick accepts.
router.get('/test-creds', async (req, res) => {
  const clientId = process.env.KICK_CLIENT_ID;
  const clientSecret = process.env.KICK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.json({ ok: false, error: 'Missing KICK_CLIENT_ID or KICK_CLIENT_SECRET env vars' });
  }

  const payload = {
    grant_type:    'client_credentials',
    client_id:     clientId,
    client_secret: clientSecret,
  };
  console.error(JSON.stringify({ event: 'kick_test_creds', client_id: clientId, secret_len: clientSecret.length }));

  const results = {};
  try {
    // Test 1: body params (per Kick docs)
    const r1 = await httpsPost(KICK_TOKEN_URL, payload);
    results.body_params = { status: r1.status, ok: r1.status === 200, error: r1.body?.error };
  } catch (err) { results.body_params = { ok: false, error: err.message }; }

  try {
    // Test 2: HTTP Basic auth header
    const r2 = await httpsPost(KICK_TOKEN_URL, payload, { useBasicAuth: true });
    results.basic_auth = { status: r2.status, ok: r2.status === 200, error: r2.body?.error };
  } catch (err) { results.basic_auth = { ok: false, error: err.message }; }

  const anyOk = results.body_params?.ok || results.basic_auth?.ok;
  return res.json({
    ok: anyOk,
    message: anyOk ? 'Credentials valid' : 'BOTH auth methods fail — client_secret likely needs regeneration on Kick developer dashboard',
    client_id: clientId,
    results,
  });
});

module.exports = router;