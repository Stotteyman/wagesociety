// routes/discord.js — Discord account-linking OAuth flow.
// Owns: GET /auth/discord/link (start OAuth), GET /auth/discord/callback (exchange code),
//       POST /auth/discord/unlink (remove link). Fires Discord role sync on link/unlink.
// Does NOT own role sync logic (lives in lib/discord-sync.js) or session management (server.js).
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const https = require('https');
const {
  getUserIdByEmail,
  getDiscordLinkByUserId,
  upsertDiscordLink,
  deleteDiscordLinkByUserId,
} = require('../db/discord');
const { syncDiscordRole, removeDiscordRoles } = require('../lib/discord-sync');

const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_OAUTH = 'https://discord.com/api/oauth2/authorize';
const DISCORD_TOKEN = 'https://discord.com/api/oauth2/token';
const SCOPES = 'identify email guilds.join';

// ── Small HTTPS helper (no extra deps) ───────────────────────────────────────
// Why: keeps us off axios/node-fetch while staying Promise-based.
function httpsPost(url, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const { hostname, pathname, search } = new URL(url);
    const options = {
      hostname,
      path: pathname + (search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('Invalid JSON from Discord token endpoint')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGet(url, accessToken) {
  return new Promise((resolve, reject) => {
    const { hostname, pathname } = new URL(url);
    const options = {
      hostname,
      path: pathname,
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('Invalid JSON from Discord user endpoint')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── GET /auth/discord/link — redirect user to Discord consent screen ─────────
router.get('/link', (req, res) => {
  console.log(JSON.stringify({ event: 'discord_link_start', email: req.session?.userEmail || null }));

  if (!req.session?.userEmail) {
    return res.redirect('/login');
  }

  const state = crypto.randomBytes(20).toString('hex');
  req.session.discordOAuthState = state;

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    state,
  });

  req.session.save((err) => {
    if (err) console.error('[discord/link] session save error:', err);
    res.redirect(`${DISCORD_OAUTH}?${params}`);
  });
});

// ── GET /auth/discord/callback — exchange code, upsert link ──────────────────
router.get('/callback', async (req, res) => {
  console.log(JSON.stringify({ event: 'discord_callback_start', query: req.query }));

  const { code, state, error: discordError } = req.query;

  if (discordError) {
    console.error(JSON.stringify({ event: 'discord_callback_denied', error: discordError }));
    return res.redirect('/creators/edit?discord=denied');
  }

  if (!req.session?.userEmail) {
    return res.redirect('/login');
  }

  // CSRF guard — state must match what we stored in session
  if (!state || state !== req.session.discordOAuthState) {
    console.error(JSON.stringify({ event: 'discord_callback_bad_state', expected: req.session.discordOAuthState, got: state }));
    return res.redirect('/creators/edit?discord=error');
  }
  delete req.session.discordOAuthState;

  if (!code) {
    return res.redirect('/creators/edit?discord=error');
  }

  try {
    // Exchange authorization code for tokens
    const tokenRes = await httpsPost(DISCORD_TOKEN, {
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.DISCORD_REDIRECT_URI,
    });

    if (tokenRes.status !== 200) {
      console.error(JSON.stringify({ event: 'discord_token_error', status: tokenRes.status, body: tokenRes.body }));
      return res.redirect('/creators/edit?discord=error');
    }

    const { access_token, refresh_token, expires_in } = tokenRes.body;
    console.log(JSON.stringify({ event: 'discord_token_ok' }));

    // Fetch Discord user identity
    const userRes = await httpsGet(`${DISCORD_API}/users/@me`, access_token);
    if (userRes.status !== 200) {
      console.error(JSON.stringify({ event: 'discord_user_fetch_error', status: userRes.status }));
      return res.redirect('/creators/edit?discord=error');
    }

    const discordUser = userRes.body;
    const discordUsername = discordUser.global_name || discordUser.username;
    const discordAvatar = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null;

    console.log(JSON.stringify({ event: 'discord_user_ok', discord_id: discordUser.id, username: discordUsername }));

    // Resolve internal user_id from email
    const userId = await getUserIdByEmail(req.session.userEmail);
    if (!userId) {
      console.error(JSON.stringify({ event: 'discord_no_user_id', email: req.session.userEmail }));
      return res.redirect('/creators/edit?discord=error');
    }

    // Upsert discord_links row
    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);
    await upsertDiscordLink({
      userId,
      discordId: discordUser.id,
      discordUsername,
      discordAvatar,
      accessToken: access_token,
      refreshToken: refresh_token,
      tokenExpiresAt,
    });

    console.log(JSON.stringify({ event: 'discord_upsert_ok', user_id: userId, discord_id: discordUser.id }));

    // Fire role sync — non-blocking; failure must not prevent the redirect
    syncDiscordRole(userId).catch(err => {
      console.error(JSON.stringify({ event: 'discord_sync_exception_in_callback', error: err.message }));
    });

    req.session.save((err) => {
      if (err) console.error('[discord/callback] session save error:', err);
      res.redirect('/creators/edit?discord=linked');
    });
  } catch (err) {
    console.error(JSON.stringify({ event: 'discord_callback_exception', message: err.message }));
    res.redirect('/creators/edit?discord=error');
  }
});

// ── POST /auth/discord/unlink — delete discord_links row ────────────────────
router.post('/unlink', async (req, res) => {
  console.log(JSON.stringify({ event: 'discord_unlink_start', email: req.session?.userEmail || null }));

  if (!req.session?.userEmail) {
    return res.redirect('/login');
  }

  try {
    const userId = await getUserIdByEmail(req.session.userEmail);
    if (userId) {
      // Remove Discord tier roles BEFORE deleting the link row (we need discord_id + token)
      await removeDiscordRoles(userId).catch(err => {
        console.error(JSON.stringify({ event: 'discord_remove_roles_exception', error: err.message }));
      });
      await deleteDiscordLinkByUserId(userId);
      console.log(JSON.stringify({ event: 'discord_unlink_ok', user_id: userId }));
    }
  } catch (err) {
    console.error(JSON.stringify({ event: 'discord_unlink_exception', message: err.message }));
  }

  res.redirect('/creators/edit?discord=unlinked');
});

module.exports = router;
