// routes/auth-discord.js — W.A.G.E. Society bot OAuth flow.
// Owns: GET /auth/discord (redirect to Discord with scopes for server install),
//       GET /auth/discord/callback (exchange code, fetch user + guilds, create/update discord_links).
// Does NOT own role sync (lib/discord-sync.js) or account-linking routes (routes/discord.js).
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { createState, consumeState } = require('../db/discord-oauth-states');
const { upsertDiscordLink, getDiscordLinkByUserId } = require('../db/discord');

const DISCORD_API  = 'https://discord.com/api/v10';
const DISCORD_OAUTH = 'https://discord.com/api/oauth2/authorize';
const DISCORD_TOKEN = 'https://discord.com/api/oauth2/token';
const BASE_URL = process.env.APP_URL || 'https://wagesociety.com';
// Scopes for bot install: identify (user), guilds.join (join guild), guilds (list user's guilds)
const SCOPES = 'identify guilds.join guilds';

function botRedirectUri() {
  if (process.env.DISCORD_BOT_REDIRECT_URI && process.env.DISCORD_BOT_REDIRECT_URI.includes('wagesociety.com')) {
    return process.env.DISCORD_BOT_REDIRECT_URI;
  }
  return `${BASE_URL}/auth/discord/callback`;
}

// ── Low-level https helpers (no extra deps) ────────────────────────────────────
function httpsPost(url, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const { hostname, pathname, search } = new URL(url);
    const req = require('https').request(
      { hostname, path: pathname + (search || ''), method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded',
                   'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch (e) { reject(new Error('Non-JSON response from Discord token endpoint')); }
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
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch (e) { reject(new Error('Non-JSON response from Discord API')); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// ── Auth guard ────────────────────────────────────────────────────────────────
function requireAuth(req, res) {
  if (!req.session?.userId && !req.session?.userEmail) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  return null;
}

// ── GET /auth/discord — start OAuth for bot install ─────────────────────────
router.get('/', (req, res) => {
  const err = requireAuth(req, res);
  if (err) return res.redirect('/login');

  const userId = req.session.userId;
  const state = crypto.randomBytes(20).toString('hex');
  const redirectPath = req.query.redirect || '/dashboard/discord/servers';

  // Persist state in DB so the callback can verify it without relying only on session
  createState(state, userId, redirectPath).then(() => {
    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      redirect_uri: botRedirectUri(),
      response_type: 'code',
      scope: SCOPES,
      state,
    });
    console.log(JSON.stringify({ event: 'bot_oauth_start', user_id: userId, state, redirect_uri: botRedirectUri() }));
    res.redirect(`${DISCORD_OAUTH}?${params}`);
  }).catch((err) => {
    console.error('[auth-discord/start]', err);
    res.status(500).send('Internal error — could not start Discord auth');
  });
});

// ── GET /auth/discord/callback — exchange code, upsert link, fetch guilds ────
router.get('/callback', async (req, res) => {
  const { code, state, error: discordError } = req.query;

  if (discordError) {
    console.error(JSON.stringify({ event: 'bot_oauth_denied', error: discordError }));
    return res.redirect('/dashboard/discord/servers?error=denied');
  }

  if (!state || !code) {
    return res.redirect('/dashboard/discord/servers?error=missing_params');
  }

  // Validate CSRF state from DB (not just session — survives session expiry between tabs)
  const stateRow = await consumeState(state).catch((err) => {
    console.error('[auth-discord/callback/consume]', err);
    return null;
  });

  if (!stateRow) {
    console.error(JSON.stringify({ event: 'bot_oauth_bad_state', got: state }));
    return res.redirect('/dashboard/discord/servers?error=state_invalid');
  }

  const userId = stateRow.user_id;
  const redirectPath = stateRow.redirect_path || '/dashboard/discord/servers';

  try {
    // Exchange code for tokens
    const tokenRes = await httpsPost(DISCORD_TOKEN, {
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: botRedirectUri(),
    });

    if (tokenRes.status !== 200) {
      console.error(JSON.stringify({ event: 'bot_oauth_token_error', status: tokenRes.status, body: tokenRes.body }));
      return res.redirect(`${redirectPath}?error=token_exchange_failed`);
    }

    const { access_token, refresh_token, expires_in } = tokenRes.body;

    // Fetch Discord user identity
    const userRes = await httpsGet(`${DISCORD_API}/users/@me`, access_token);
    if (userRes.status !== 200) {
      console.error(JSON.stringify({ event: 'bot_oauth_user_error', status: userRes.status }));
      return res.redirect(`${redirectPath}?error=user_fetch_failed`);
    }

    const discordUser = userRes.body;
    const discordUsername = discordUser.global_name || discordUser.username;
    const discordAvatar = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null;

    // Fetch user's guild list (used for server selection UI)
    const guildsRes = await httpsGet(`${DISCORD_API}/users/@me/guilds`, access_token);
    const guildIds = guildsRes.status === 200
      ? guildsRes.body.map((g) => g.id)
      : [];

    // Upsert discord_links row with guild list
    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);
    await upsertDiscordLink({
      userId,
      discordId: discordUser.id,
      discordUsername,
      discordAvatar,
      accessToken: access_token,
      refreshToken: refresh_token,
      tokenExpiresAt,
      guildIds,
    });

    console.log(JSON.stringify({
      event: 'bot_oauth_success',
      user_id: userId,
      discord_id: discordUser.id,
      username: discordUsername,
      guild_count: guildIds.length,
    }));

    res.redirect(`${redirectPath}?status=linked&username=${encodeURIComponent(discordUsername)}`);
  } catch (err) {
    console.error('[auth-discord/callback]', err);
    res.redirect(`${redirectPath}?error=oauth_error`);
  }
});

module.exports = router;