// routes/discord.js — Discord account-linking OAuth flow.
// Owns: GET /auth/discord/link (start OAuth), GET /auth/discord/callback (exchange code),
//       POST /auth/discord/unlink (remove link). Fires Discord role sync on link/unlink.
// Does NOT own role sync logic (lives in lib/discord-sync.js) or session management (server.js).
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const https = require('https');

// Production domain — Discord account-linking callback
const DISCORD_BASE_URL = process.env.APP_URL || 'https://wagesociety.com';
function discordRedirectUri() {
  // Use env var only if it points to wagesociety.com (guards against ai.wagesociety.com misconfiguration)
  if (process.env.DISCORD_REDIRECT_URI && process.env.DISCORD_REDIRECT_URI.includes('wagesociety.com')) {
    return process.env.DISCORD_REDIRECT_URI;
  }
  return `${DISCORD_BASE_URL}/auth/discord/callback`;
}
const {
  getUserIdByEmail,
  getDiscordLinkByUserId,
  upsertDiscordLink,
  deleteDiscordLinkByUserId,
} = require('../db/discord');
const { upsertConnection, deleteConnection } = require('../db/oauth-providers');
const { syncDiscordRole, removeDiscordRoles } = require('../lib/discord-sync');
const { getConnectedServers } = require('../db/discord-servers');

const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_OAUTH = 'https://discord.com/api/oauth2/authorize';
const DISCORD_TOKEN = 'https://discord.com/api/oauth2/token';
const SCOPES = 'identify email guilds guilds.join';

// ── WAGE role assignment/removal on connect/disconnect ─────────────────────
// Uses bot token to add/remove "WAGE Society Member" role in all bot-managed servers.
function botRequest(method, path, body) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return Promise.resolve({ status: 0 });
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const { hostname, pathname } = new URL(DISCORD_API + path);
    const options = {
      hostname, path: pathname, method,
      headers: {
        Authorization: `Bot ${botToken}`, 'User-Agent': 'WageOSBot/1.0',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', () => resolve({ status: 0 }));
    if (payload) req.write(payload);
    req.end();
  });
}

async function assignWageRolesOnConnect(discordId) {
  const servers = await getConnectedServers();
  for (const { guild_id, wage_role_id } of servers) {
    if (!wage_role_id) continue;
    const memberRes = await botRequest('GET', `/guilds/${guild_id}/members/${discordId}`);
    if (memberRes.status !== 200) continue;
    const roles = memberRes.body?.roles || [];
    if (roles.includes(wage_role_id)) continue;
    await botRequest('PUT', `/guilds/${guild_id}/members/${discordId}/roles/${wage_role_id}`, {});
    console.log(JSON.stringify({ event: 'wage_role_assigned_on_connect', guild_id, discord_id: discordId }));
  }
}

async function removeWageRolesOnDisconnect(discordId) {
  const servers = await getConnectedServers();
  for (const { guild_id, wage_role_id } of servers) {
    if (!wage_role_id) continue;
    const memberRes = await botRequest('GET', `/guilds/${guild_id}/members/${discordId}`);
    if (memberRes.status !== 200) continue;
    const roles = memberRes.body?.roles || [];
    if (!roles.includes(wage_role_id)) continue;
    await botRequest('DELETE', `/guilds/${guild_id}/members/${discordId}/roles/${wage_role_id}`);
    console.log(JSON.stringify({ event: 'wage_role_removed_on_disconnect', guild_id, discord_id: discordId }));
  }
}

// ── Guild membership check ────────────────────────────────────────────────────
// Uses the user's access token to fetch their guild list and check membership.
// Returns { inGuild: bool, needsReauth: bool }.
// needsReauth = true means the token lacked guilds scope — they'll be prompted to
// re-auth with guilds.join scope and re-trigger the link flow.
async function checkGuildMembership(accessToken) {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId || !accessToken) return { inGuild: true, needsReauth: false };

  try {
    const res = await httpsGet(`${DISCORD_API}/users/@me/guilds`, accessToken);
    if (res.status !== 200) {
      if (res.status === 403) return { inGuild: false, needsReauth: true };
      return { inGuild: true, needsReauth: false }; // treat errors as "already in" — sync will handle it
    }
    const guilds = Array.isArray(res.body) ? res.body : [];
    const inGuild = guilds.some(g => g.id === guildId);
    return { inGuild, needsReauth: false };
  } catch {
    return { inGuild: true, needsReauth: false };
  }
}

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

  // Allow override of return URL (e.g., return_url=/settings)
  req.session.returnTo = req.query.return_url || '/settings';

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: discordRedirectUri(),
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
    return res.redirect(`${returnTo}?discord=denied`);
  }

  if (!req.session?.userEmail) {
    return res.redirect('/login');
  }

  const returnTo = req.session.returnTo || '/settings';
  delete req.session.returnTo;

  // CSRF guard — state must match what we stored in session
  if (!state || state !== req.session.discordOAuthState) {
    console.error(JSON.stringify({ event: 'discord_callback_bad_state', expected: req.session.discordOAuthState, got: state }));
    return res.redirect(`${returnTo}?discord=error`);
  }
  delete req.session.discordOAuthState;

  if (!code) {
    return res.redirect(`${returnTo}?discord=error`);
  }

  try {
    // Exchange authorization code for tokens
    const tokenRes = await httpsPost(DISCORD_TOKEN, {
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: discordRedirectUri(),
    });

    if (tokenRes.status !== 200) {
      console.error(JSON.stringify({ event: 'discord_token_error', status: tokenRes.status, body: tokenRes.body }));
      return res.redirect(`${returnTo}?discord=error`);
    }

    const { access_token, refresh_token, expires_in } = tokenRes.body;
    console.log(JSON.stringify({ event: 'discord_token_ok' }));

    // Fetch Discord user identity
    const userRes = await httpsGet(`${DISCORD_API}/users/@me`, access_token);
    if (userRes.status !== 200) {
      console.error(JSON.stringify({ event: 'discord_user_fetch_error', status: userRes.status }));
      return res.redirect(`${returnTo}?discord=error`);
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
      return res.redirect(`${returnTo}?discord=error`);
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

    // Also write to oauth_connections so the /settings Connected Accounts card
    // shows the Discord link — settings page reads from oauth_connections.
    // req.session.userId is the auth_users UUID (needed by the FK on oauth_connections).
    if (req.session.userId) {
      await upsertConnection({
        userId: req.session.userId,
        provider: 'discord',
        providerUserId: discordUser.id,
        email: discordUser.email || null,
        displayName: discordUsername,
        avatarUrl: discordAvatar,
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt,
      }).catch(err => {
        // Non-fatal — discord_links is the source of truth; this is for UI display only.
        console.error(JSON.stringify({ event: 'discord_oauth_conn_upsert_warn', error: err.message }));
      });
    }

    console.log(JSON.stringify({ event: 'discord_upsert_ok', user_id: userId, discord_id: discordUser.id }));

    // Fire role sync — non-blocking; failure must not prevent the redirect
    syncDiscordRole(userId).catch(err => {
      console.error(JSON.stringify({ event: 'discord_sync_exception_in_callback', error: err.message }));
    });

    // Assign "WAGE Society Member" role in all bot-managed servers where user is a member
    assignWageRolesOnConnect(discordUser.id).catch(err => {
      console.error(JSON.stringify({ event: 'wage_role_connect_error', error: err.message }));
    });

    // Check guild membership — prompt to join if not already a member
    checkGuildMembership(access_token).then(({ inGuild, needsReauth }) => {
      req.session.discordNeedsReauth = needsReauth;
      req.session.save((err) => {
        if (err) console.error('[discord/callback] session save error:', err);
        if (!inGuild) {
          return res.redirect(`${returnTo}?discord=linked&join_server=1`);
        }
        res.redirect(`${returnTo}?discord=linked`);
      });
    }).catch(() => {
      // Non-fatal — proceed with the normal redirect
      req.session.save((err) => {
        if (err) console.error('[discord/callback] session save error:', err);
        res.redirect(`${returnTo}?discord=linked`);
      });
    });
  } catch (err) {
    console.error(JSON.stringify({ event: 'discord_callback_exception', message: err.message }));
    res.redirect(`${returnTo}?discord=error`);
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
      // Get discord_id before deleting the link (needed for WAGE role removal)
      const link = await getDiscordLinkByUserId(userId).catch(() => null);
      // Remove Discord tier roles BEFORE deleting the link row (we need discord_id + token)
      await removeDiscordRoles(userId).catch(err => {
        console.error(JSON.stringify({ event: 'discord_remove_roles_exception', error: err.message }));
      });
      // Remove WAGE Society Member role from all bot-managed servers
      if (link?.discord_id) {
        await removeWageRolesOnDisconnect(link.discord_id).catch(err => {
          console.error(JSON.stringify({ event: 'wage_role_disconnect_error', error: err.message }));
        });
      }
      await deleteDiscordLinkByUserId(userId);
      console.log(JSON.stringify({ event: 'discord_unlink_ok', user_id: userId }));
    }
    // Also remove from oauth_connections so the settings card updates correctly
    if (req.session.userId) {
      await deleteConnection(req.session.userId, 'discord').catch(err => {
        console.error(JSON.stringify({ event: 'discord_oauth_conn_delete_warn', error: err.message }));
      });
    }
  } catch (err) {
    console.error(JSON.stringify({ event: 'discord_unlink_exception', message: err.message }));
  }

  res.redirect('/settings?discord=unlinked');
});

module.exports = router;
