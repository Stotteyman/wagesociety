// routes/auth-discord-login.js — Discord OAuth as a primary login/signup method.
// Owns: GET /auth/discord-login (redirect to Discord), GET /auth/discord-login/callback (exchange + session).
// Separate from /auth/discord (bot install) and /auth/discord/link (account linking).
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { upsertConnection, getByProviderUserId } = require('../db/oauth-providers');
const { getUserByEmail, upsertUser } = require('../db/users');

// Production domain — Discord OAuth callback registered as https://wagesociety.com/auth/discord-login/callback
const BASE_URL = process.env.APP_URL || 'https://wagesociety.com';

const DISCORD_OAUTH  = 'https://discord.com/api/oauth2/authorize';
const DISCORD_TOKEN = 'https://discord.com/api/oauth2/token';
const DISCORD_API   = 'https://discord.com/api/v10';
const SCOPES = 'identify email';
// Note: guilds.join scope intentionally excluded — this is login, not bot install

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
        let raw = '';
        res.on('data', c => { raw += c; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch (e) { reject(new Error('Non-JSON response from Discord API')); }
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
      if (err) console.error('[auth-discord-login] session regenerate error:', err);
      req.session.userId = user.id;
      req.session.userEmail = user.email;
      req.session.userRole = user.role || 'member';
      req.session.userTier = user.tier || 'FREE';
      req.session.save((saveErr) => {
        if (saveErr) console.error('[auth-discord-login] session save error:', saveErr);
        resolve();
      });
    });
  });
}

// ── GET /auth/discord-login — start Discord OAuth for login/signup ───────────
router.get('/', (req, res) => {
  // Link mode: if user is already logged in, treat as account linking
  const state = crypto.randomBytes(20).toString('hex');
  req.session.discordLoginState = state;
  const returnTo = req.session.returnTo || '/dashboard';
  req.session.oauthReturnTo = returnTo;

  const params = new URLSearchParams({
    client_id:     process.env.DISCORD_CLIENT_ID,
    redirect_uri:  `${BASE_URL}/auth/discord-login/callback`,
    response_type: 'code',
    scope:         SCOPES,
    state,
  });

  req.session.save(() => {
    res.redirect(`${DISCORD_OAUTH}?${params}`);
  });
});

// ── GET /auth/discord-login/callback ──────────────────────────────────────────
router.get('/callback', async (req, res) => {
  const { code, state, error: discordError } = req.query;

  if (discordError) {
    console.error(JSON.stringify({ event: 'discord_login_denied', error: discordError }));
    return res.redirect('/login?error=discord_denied');
  }

  if (!state || state !== req.session.discordLoginState) {
    console.error(JSON.stringify({ event: 'discord_login_bad_state', got: state }));
    return res.redirect('/login?error=discord_state_invalid');
  }
  delete req.session.discordLoginState;

  if (!code) return res.redirect('/login?error=discord_no_code');

  const returnTo = req.session.oauthReturnTo || '/dashboard';
  delete req.session.oauthReturnTo;

  try {
    const tokenRes = await httpsPost(DISCORD_TOKEN, {
      client_id:     process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type:    'authorization_code',
      code,
      redirect_uri:  `${BASE_URL}/auth/discord-login/callback`,
    });

    if (tokenRes.status !== 200) {
      console.error(JSON.stringify({ event: 'discord_login_token_error', status: tokenRes.status }));
      return res.redirect(`${returnTo}?error=discord_token_failed`);
    }

    const { access_token, refresh_token, expires_in } = tokenRes.body;

    const userRes = await httpsGet(`${DISCORD_API}/users/@me`, access_token);
    if (userRes.status !== 200) {
      console.error(JSON.stringify({ event: 'discord_login_user_error', status: userRes.status }));
      return res.redirect(`${returnTo}?error=discord_user_fetch_failed`);
    }

    const discordUser = userRes.body;
    const providerUserId = discordUser.id;
    const discordUsername = discordUser.global_name || discordUser.username;
    const discordAvatar = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null;
    const tokenExpiresAt = expires_in ? new Date(Date.now() + expires_in * 1000) : null;

    // If user was logged in already, treat as link flow
    if (req.session.userId) {
      await upsertConnection({
        userId: req.session.userId,
        provider: 'discord',
        providerUserId,
        email: null,
        displayName: discordUsername,
        avatarUrl: discordAvatar,
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt,
      });
      console.log(JSON.stringify({ event: 'discord_login_link_ok', user_id: req.session.userId }));
      return res.redirect(`${returnTo}?discord=linked`);
    }

    // Check if this Discord account is already linked to a WageOS user
    const existingConnection = await getByProviderUserId('discord', providerUserId);
    if (existingConnection) {
      const user = await require('../db/users').getUserById(existingConnection.user_id);
      if (user) {
        await setUserSession(req, user);
        req.session.showTrialPrompt = true;
        return res.redirect(returnTo);
      }
    }

    // Try email from Discord (Discord may include email if 'email' scope was granted)
    // ── Guild membership check ────────────────────────────────────────────────────
async function checkGuildMembershipDiscordLogin(accessToken) {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId || !accessToken) return { inGuild: true };

  try {
    const res = await httpsGet(`${DISCORD_API}/users/@me/guilds`, accessToken);
    if (res.status !== 200) return { inGuild: false };
    const guilds = Array.isArray(res.body) ? res.body : [];
    return { inGuild: guilds.some(g => g.id === guildId) };
  } catch {
    return { inGuild: false };
  }
}

// Note: email scope is included but Discord requires "verified email" setting
    const email = discordUser.email || null;

    // New user
    const newUser = await upsertUser({
      email: email || `${discordUsername}@discord.user`,
      displayName: discordUsername,
      avatarUrl: discordAvatar,
      externalAuthId: providerUserId,
      externalProvider: 'discord',
    });

    await upsertConnection({
      userId: newUser.id,
      provider: 'discord',
      providerUserId,
      email: email || `${discordUsername}@discord.user`,
      displayName: discordUsername,
      avatarUrl: discordAvatar,
      accessToken: access_token,
      refreshToken: refresh_token,
      tokenExpiresAt,
    });

    // Check guild membership after signup
    const guildCheck = await checkGuildMembershipDiscordLogin(access_token);
    await setUserSession(req, newUser);
    req.session.showTrialPrompt = true;
    console.log(JSON.stringify({ event: 'discord_login_signup_ok', user_id: newUser.id }));

    if (!guildCheck.inGuild) {
      return res.redirect('/onboarding?join_server=1');
    }
    res.redirect('/onboarding');
  } catch (err) {
    console.error('[auth-discord-login/callback]', err);
    res.redirect(`${returnTo}?error=discord_oauth_error`);
  }
});

module.exports = router;