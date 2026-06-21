// routes/api/me.js — User access, profile, YouTube channels, and avatar upload.
const express = require('express');
const router = express.Router();
const { getProfileByEmail, upsertProfile } = require('../../db/profiles');
const { getMemberAccess } = require('../../db/orgAccess');
const { getByUserIdAndProvider } = require('../../db/oauth-providers');
const { getUserByEmail } = require('../../db/users');

// GET /api/me/access — role + permissions for current session
router.get('/access', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Not authenticated' });
    const access = await getMemberAccess(email);
    res.json({
      requester: { email, source: 'session-auth' },
      ...access,
    });
  } catch (err) {
    console.error('[/api/me/access]', err);
    res.status(500).json({ error: 'Failed to load access info' });
  }
});

// GET /api/me/profile — current user's profile
router.get('/profile', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Not authenticated' });
    const profile = await getProfileByEmail(email);
    res.json(profile || { email });
  } catch (err) {
    console.error('[/api/me/profile GET]', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// PUT /api/me/profile — update profile fields
router.put('/profile', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Not authenticated' });
    const { username, display_name, bio, avatar_url, skills } = req.body;
    const profile = await upsertProfile(email, { username, display_name, bio, avatar_url, skills });
    res.json(profile);
  } catch (err) {
    console.error('[/api/me/profile PUT]', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// GET /api/me/youtube-channels — fetch YouTube channels from Google API (requires Google connection)
router.get('/youtube-channels', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Not authenticated' });
    const authUser = await getUserByEmail(email).catch(() => null);
    if (!authUser) return res.status(401).json({ error: 'User not found' });

    const googleConn = await getByUserIdAndProvider(authUser.id, 'google').catch(() => null);
    if (!googleConn) return res.json({ channels: [], error: 'Google account not connected' });

    let accessToken = googleConn.access_token;
    if (!accessToken) return res.json({ channels: [], error: 'No access token' });

    // If token is expired, try refresh before giving up
    if (googleConn.token_expires_at && new Date(googleConn.token_expires_at) < new Date()) {
      if (!googleConn.refresh_token) {
        return res.json({ channels: [], error: 'Google token expired — disconnect and reconnect your Google account' });
      }
      const refreshed = await refreshGoogleToken(googleConn.refresh_token);
      if (!refreshed) {
        return res.json({ channels: [], error: 'Google token refresh failed — disconnect and reconnect your Google account' });
      }
      // Store new tokens in DB
      const { updateTokens } = require('../../db/oauth-providers');
      await updateTokens(authUser.id, 'google', {
        accessToken: refreshed.access_token,
        tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      });
      accessToken = refreshed.access_token;
    }

    // Verify token actually has youtube scope before hitting the API.
    // Google silently strips youtube.readonly scope when YouTube Data API v3
    // is not enabled in the GCP project — reconnecting won't help.
    const tokenInfo = await checkTokenScopes(accessToken).catch(() => null);
    if (tokenInfo) {
      console.log('[youtube-channels] tokeninfo scopes:', tokenInfo.scope || 'NONE');
      if (tokenInfo.error) {
        console.error('[youtube-channels] tokeninfo error:', tokenInfo.error_description || tokenInfo.error);
        return res.json({ channels: [], error: 'Google token invalid — please disconnect and reconnect your Google account' });
      }
      if (tokenInfo.scope && !tokenInfo.scope.includes('youtube')) {
        // Token lacks youtube scope despite it being requested in the auth URL.
        // Root cause: YouTube Data API v3 not enabled in Google Cloud project.
        // Reconnecting won't fix this — it's a server configuration issue.
        console.error('[youtube-channels] token lacks youtube scope (API likely not enabled in GCP). Has:', tokenInfo.scope);
        return res.json({ channels: [], error: 'YouTube Data API is not yet enabled for this app. Your Google account is connected — you can still select YouTube as your primary platform. Channel auto-detection will be available once the API is activated.' });
      }
    }

    // Fetch from YouTube Data API v3
    const result = await new Promise((resolve, reject) => {
      const req2 = require('https').request(
        { hostname: 'www.googleapis.com', path: '/youtube/v3/channels?part=snippet,contentDetails&mine=true&maxResults=50', method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` } },
        (r) => {
          let raw = '';
          r.on('data', c => { raw += c; });
          r.on('end', () => {
            try { resolve({ status: r.statusCode, body: JSON.parse(raw) }); }
            catch (e) { reject(new Error('Non-JSON response from YouTube API')); }
          });
        }
      );
      req2.on('error', reject);
      req2.end();
    });

    if (result.status === 403 || result.status === 401) {
      // Log full error body to diagnose: API-not-enabled vs. missing-scope vs. invalid-token
      console.error('[youtube-channels] ' + result.status + ' from YouTube API:', JSON.stringify(result.body));

      // Check if YouTube Data API v3 is not enabled in Google Cloud project
      const errMsg = JSON.stringify(result.body).toLowerCase();
      if (errMsg.includes('has not been used in project') || errMsg.includes('is not enabled') || errMsg.includes('accessnotconfigured') || errMsg.includes('youtube data api')) {
        return res.json({ channels: [], error: 'YouTube Data API is not yet enabled for this app. Channel auto-detection will be available once activated by the admin.' });
      }

      // tokeninfo check was already done above, so if we got here the token
      // has the right scope but API still rejects it — configuration issue
      return res.json({ channels: [], error: 'YouTube API configuration issue detected. Channel auto-detection will be available once resolved by the admin.' });
    }
    if (result.status !== 200) {
      console.error('[youtube-channels]', result.body);
      return res.json({ channels: [], error: 'Failed to fetch YouTube channels' });
    }

    const channels = (result.body.items || []).map(item => ({
      channelId: item.id,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails?.default?.url || null,
      uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads || null,
    }));

    res.json({ channels });
  } catch (err) {
    console.error('[/api/me/youtube-channels]', err);
    res.status(500).json({ channels: [], error: 'Server error fetching channels' });
  }
});

// PUT /api/me/youtube-channel — save the featured YouTube channel selection.
// Also caches channel name + avatar so we never display the Google account real name.
// Upserts a livestreams row so the channel appears on /streams.
router.put('/youtube-channel', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Not authenticated' });
    const userId = req.session.userId;
    const { channelId, channelName, channelAvatar } = req.body;
    if (channelId !== null && typeof channelId !== 'string') {
      return res.status(400).json({ error: 'channelId must be a string or null' });
    }
    // Never save dropdown placeholder text as real channel data
    const safeName = (channelName && !channelName.startsWith('—') && channelName !== 'No channel selected')
      ? channelName : null;
    const profile = await upsertProfile(email, {
      featured_youtube_channel_id: channelId || null,
      youtube_channel_name: channelId ? safeName : null,
      youtube_channel_avatar: channelId ? (channelAvatar || null) : null,
    });

    // Populate livestreams table so YouTube channel appears on /streams page
    if (channelId && userId) {
      const { upsertStreamByUserId } = require('../../db/livestreams');
      await upsertStreamByUserId(userId, {
        platform: 'youtube',
        platformChannelId: channelId,
        channelName: safeName || channelId,
        streamUrl: `https://youtube.com/channel/${channelId}/live`,
      }).catch(err => console.error('[youtube-channel] stream upsert error:', err));
    }

    res.json({ success: true, featured_youtube_channel_id: profile.featured_youtube_channel_id });
  } catch (err) {
    console.error('[/api/me/youtube-channel PUT]', err);
    res.status(500).json({ error: 'Failed to save YouTube channel' });
  }
});

// PUT /api/me/primary-platform — set which OAuth platform to feature on profile.
// Uses direct UPDATE instead of upsertProfile because COALESCE in upsertProfile
// prevents clearing to null when user selects "None".
// When YouTube is selected, also ensures a livestreams row exists for the /streams page.
router.put('/primary-platform', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Not authenticated' });
    const userId = req.session.userId;
    const { primary_platform } = req.body;
    const validPlatforms = ['youtube', 'kick', 'twitch'];
    if (primary_platform !== null && !validPlatforms.includes(primary_platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }
    const { setPrimaryPlatform } = require('../../db/profiles');
    await setPrimaryPlatform(email, primary_platform);

    // When YouTube is selected as primary, ensure a livestreams row exists
    // so the creator appears on /streams. Uses the featured channel if set.
    if (primary_platform === 'youtube' && userId) {
      const profile = await getProfileByEmail(email);
      const channelId = profile?.featured_youtube_channel_id;
      if (channelId) {
        const { upsertStreamByUserId } = require('../../db/livestreams');
        await upsertStreamByUserId(userId, {
          platform: 'youtube',
          platformChannelId: channelId,
          channelName: profile.youtube_channel_name || channelId,
          streamUrl: `https://youtube.com/channel/${channelId}/live`,
        }).catch(err => console.error('[primary-platform] stream upsert error:', err));
      }
    }

    res.json({ success: true, primary_platform });
  } catch (err) {
    console.error('[/api/me/primary-platform]', err);
    res.status(500).json({ error: 'Failed to update primary platform' });
  }
});

// GET /api/me/connections — all OAuth connections for current user.
// Merges oauth_connections (Google, Kick) with discord_links (Discord uses separate table).
// Privacy: Google real name is NEVER exposed — shows YouTube channel name or email prefix.
router.get('/connections', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Not authenticated' });
    const authUser = await require('../../db/users').getUserByEmail(email);
    if (!authUser) return res.status(401).json({ error: 'User not found' });

    const { getUserConnections } = require('../../db/oauth-providers');
    const conns = await getUserConnections(authUser.id);

    // Privacy: never expose Google real name. Show YouTube channel name or email prefix.
    const profile = await getProfileByEmail(email);
    // A valid channel name is a real YouTube channel, not the dropdown placeholder
    const hasRealChannelName = profile?.youtube_channel_name
      && !profile.youtube_channel_name.startsWith('—')
      && profile.youtube_channel_name !== 'No channel selected';
    for (const c of conns) {
      if (c.provider === 'google') {
        if (hasRealChannelName) {
          c.display_name = profile.youtube_channel_name;
          if (profile.youtube_channel_avatar) c.avatar_url = profile.youtube_channel_avatar;
        } else {
          // No valid channel selected — try to auto-fetch channel name from YouTube API
          const channelInfo = await autoFetchYouTubeChannel(authUser.id, email).catch(() => null);
          if (channelInfo) {
            c.display_name = channelInfo.name;
            if (channelInfo.avatar) c.avatar_url = channelInfo.avatar;
          } else {
            // Fallback: show email prefix, never Google real name
            c.display_name = c.email ? c.email.split('@')[0] : 'Connected';
          }
        }
        // Always flag whether a channel has been selected (helps frontend prompt selection)
        c.youtube_channel_selected = !!hasRealChannelName;
      }
      // For Discord in oauth_connections: enrich with discord_links data (avatar, username)
      if (c.provider === 'discord') {
        const { getUserIdByEmail, getDiscordLinkByUserId } = require('../../db/discord');
        const discordUserId = await getUserIdByEmail(email).catch(() => null);
        if (discordUserId) {
          const discordLink = await getDiscordLinkByUserId(discordUserId).catch(() => null);
          if (discordLink) {
            // Prefer discord_links data (has avatar URL, username) over oauth_connections
            c.display_name = discordLink.discord_username || c.display_name || 'Connected';
            c.avatar_url = discordLink.discord_avatar || c.avatar_url || null;
            if (discordLink.linked_at) c.linked_at = discordLink.linked_at;
          }
        }
      }
    }

    // Merge Discord from discord_links if not already in oauth_connections
    const hasDiscord = conns.some(c => c.provider === 'discord');
    if (!hasDiscord) {
      const { getUserIdByEmail, getDiscordLinkByUserId } = require('../../db/discord');
      const discordUserId = await getUserIdByEmail(email).catch(() => null);
      if (discordUserId) {
        const discordLink = await getDiscordLinkByUserId(discordUserId).catch(() => null);
        if (discordLink) {
          conns.push({
            provider: 'discord',
            display_name: discordLink.discord_username || 'Connected',
            avatar_url: discordLink.discord_avatar || null,
            email: null,
            linked_at: discordLink.linked_at,
          });
        }
      }
    }

    res.json({ connections: conns });
  } catch (err) {
    console.error('[/api/me/connections]', err);
    res.status(500).json({ error: 'Failed to load connections' });
  }
});

// POST /api/me/connections/:provider/unlink — remove an OAuth connection
router.post('/connections/:provider/unlink', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Not authenticated' });
    const authUser = await require('../../db/users').getUserByEmail(email);
    if (!authUser) return res.status(401).json({ error: 'User not found' });

    const provider = req.params.provider;
    const validProviders = ['google', 'kick', 'discord'];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    const { deleteConnection } = require('../../db/oauth-providers');
    await deleteConnection(authUser.id, provider);
    console.log(JSON.stringify({ event: `${provider}_unlink_ok`, user_id: authUser.id }));
    res.json({ success: true });
  } catch (err) {
    console.error('[/api/me/connections/:provider/unlink]', err);
    res.status(500).json({ error: 'Failed to unlink account' });
  }
});

// GET /api/me/discord/status — link status + selected guild for settings page.
// Returns { linked, discordId, discordUsername, discordAvatar, selectedGuildId, selectedGuildName }.
router.get('/discord/status', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Not authenticated' });

    // discord_links.user_id is an integer FK to the legacy `users` table,
    // NOT the UUID from auth_users. Look up the integer ID by email first.
    const { getUserIdByEmail, getDiscordLinkByUserId } = require('../../db/discord');
    const intUserId = await getUserIdByEmail(email);
    if (!intUserId) return res.json({ linked: false });
    const link = await getDiscordLinkByUserId(intUserId);

    if (!link) {
      return res.json({ linked: false });
    }

    res.json({
      linked: true,
      discordId: link.discord_id,
      discordUsername: link.discord_username,
      discordAvatar: link.discord_avatar,
      selectedGuildId: link.selected_guild_id || null,
      selectedGuildName: link.selected_guild_name || null,
      linkedAt: link.linked_at,
    });
  } catch (err) {
    console.error('[/api/me/discord/status]', err);
    res.status(500).json({ error: 'Failed to load Discord status' });
  }
});

// GET /api/me/discord/guilds — fetch the user's Discord servers where they have MANAGE_GUILD.
// Requires a Discord OAuth link with a valid access token. Auto-refreshes expired tokens.
router.get('/discord/guilds', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Not authenticated' });

    // discord_links uses integer user_id from legacy `users` table
    const { getUserIdByEmail, getDiscordLinkByUserId, updateDiscordLink } = require('../../db/discord');
    const { refreshDiscordToken } = require('../../lib/discord-token');
    const intUserId = await getUserIdByEmail(email);
    if (!intUserId) return res.status(400).json({ error: 'Discord not linked' });
    const link = await getDiscordLinkByUserId(intUserId);
    if (!link?.access_token) {
      return res.status(400).json({ error: 'Discord not linked' });
    }

    // Auto-refresh expired token before fetching guilds
    let accessToken = link.access_token;
    const refreshed = await refreshDiscordToken(link);
    if (refreshed) {
      accessToken = refreshed.access_token;
      await updateDiscordLink(intUserId, {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        token_expires_at: refreshed.token_expires_at,
      });
    }

    // Fetch guild list from Discord with the (refreshed) access token
    const DISCORD_API = 'https://discord.com/api/v10';
    const guildsRes = await httpsGet(`${DISCORD_API}/users/@me/guilds`, accessToken);

    if (guildsRes.status === 401) {
      // Refresh token itself is revoked — user must re-authenticate
      return res.json({ guilds: [], needsRelink: true, error: 'Discord session expired — please reconnect your Discord account' });
    }
    if (guildsRes.status !== 200) {
      return res.status(502).json({ error: 'Failed to fetch servers from Discord' });
    }

    // Filter to servers where the user has MANAGE_GUILD permission (bit 0x20 = 32)
    const MANAGE_GUILD = 0x20;
    const eligible = guildsRes.body
      .filter(g => (g.permissions & MANAGE_GUILD) !== 0)
      .map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon
          ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png`
          : null,
      }));

    res.json({ guilds: eligible, total: eligible.length });
  } catch (err) {
    console.error('[/api/me/discord/guilds]', err);
    res.status(500).json({ error: 'Failed to load servers' });
  }
});

// POST /api/me/discord/select-guild — store the selected guild in discord_links.
// Body: { guildId, guildName }
router.post('/discord/select-guild', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Not authenticated' });

    const { guildId, guildName } = req.body;
    if (!guildId || typeof guildId !== 'string') {
      return res.status(400).json({ error: 'guildId is required' });
    }

    // discord_links uses integer user_id from legacy `users` table
    const { getUserIdByEmail, updateSelectedGuild } = require('../../db/discord');
    const intUserId = await getUserIdByEmail(email);
    if (!intUserId) return res.status(400).json({ error: 'Discord not linked' });
    await updateSelectedGuild(intUserId, guildId, guildName || null);

    console.log(JSON.stringify({ event: 'guild_selected', email, guild_id: guildId, guild_name: guildName }));

    res.json({ success: true, guildId, guildName: guildName || null });
  } catch (err) {
    console.error('[/api/me/discord/select-guild]', err);
    res.status(500).json({ error: 'Failed to save server selection' });
  }
});

// ── Google token refresh — uses stored refresh_token to get a new access_token ──
async function refreshGoogleToken(refreshToken) {
  try {
    const body = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString();

    const result = await new Promise((resolve, reject) => {
      const req = require('https').request(
        { hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } },
        (res) => {
          let raw = '';
          res.on('data', c => { raw += c; });
          res.on('end', () => {
            try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
            catch (e) { reject(new Error('Non-JSON from Google token refresh')); }
          });
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    if (result.status !== 200) {
      console.error('[google-refresh] failed:', result.body);
      return null;
    }
    return result.body; // { access_token, expires_in, ... }
  } catch (err) {
    console.error('[google-refresh] error:', err.message);
    return null;
  }
}

// ── Auto-fetch YouTube channel name from Google API ─────────────────────────
// Used by /connections to show YouTube channel name instead of Google real name.
// Silently refreshes token if expired, caches result in member_profiles.
async function autoFetchYouTubeChannel(authUserId, email) {
  // Read full Google connection (with tokens) from DB
  const googleConn = await getByUserIdAndProvider(authUserId, 'google').catch(() => null);
  if (!googleConn) return null;

  let accessToken = googleConn.access_token;
  if (!accessToken) return null;

  // Refresh if expired
  if (googleConn.token_expires_at && new Date(googleConn.token_expires_at) < new Date()) {
    if (!googleConn.refresh_token) return null;
    const refreshed = await refreshGoogleToken(googleConn.refresh_token);
    if (!refreshed) return null;
    const { updateTokens } = require('../../db/oauth-providers');
    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000);
    await updateTokens(authUserId, 'google', { accessToken: refreshed.access_token, tokenExpiresAt: newExpiry });
    accessToken = refreshed.access_token;
  }

  // Fetch channels
  const result = await new Promise((resolve) => {
    const req2 = require('https').request(
      { hostname: 'www.googleapis.com', path: '/youtube/v3/channels?part=snippet&mine=true&maxResults=1', method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` } },
      (r) => {
        let raw = '';
        r.on('data', c => { raw += c; });
        r.on('end', () => { try { resolve({ status: r.statusCode, body: JSON.parse(raw) }); } catch { resolve(null); } });
      }
    );
    req2.on('error', () => resolve(null));
    req2.end();
  });

  if (!result || result.status !== 200 || !result.body?.items?.length) return null;
  const ch = result.body.items[0];
  const name = ch.snippet?.title;
  const avatar = ch.snippet?.thumbnails?.default?.url || null;
  const channelId = ch.id;

  // Cache in member_profiles so future lookups skip the API call
  if (name) {
    await upsertProfile(email, {
      youtube_channel_name: name,
      youtube_channel_avatar: avatar,
      featured_youtube_channel_id: channelId,
    }).catch(() => {});
  }

  return { name, avatar, channelId };
}

// ── Google tokeninfo — verify which scopes a token actually has ──────────────
async function checkTokenScopes(accessToken) {
  return new Promise((resolve) => {
    const url = `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`;
    const { hostname, pathname, search } = new URL(url);
    const req = require('https').request(
      { hostname, path: pathname + search, method: 'GET' },
      (r) => {
        let raw = '';
        r.on('data', c => { raw += c; });
        r.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
      }
    );
    req.on('error', () => resolve(null));
    req.end();
  });
}

// ── Low-level https helper (no extra deps) ────────────────────────────────────
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

// POST /api/me/avatar — upload avatar image (multipart/form-data, field name "avatar")
router.post('/avatar', (() => {
  const multer = require('multer');
  return [
    (req, _res, next) => {
      // Attach multer single upload to the request
      const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 5 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
          const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
          cb(null, allowed.includes(file.mimetype));
        },
      });
      upload.single('avatar')(req, _res, next);
    },
    async (req, res) => {
      try {
        const email = req.session?.userEmail;
        if (!email) return res.status(401).json({ error: 'Not authenticated' });
        if (!req.file) return res.status(400).json({ error: 'No file uploaded — send "avatar" field.' });

        const { getUserByEmail } = require('../../db/users');
        const authUser = await getUserByEmail(email).catch(() => null);

        const { uploadAvatar } = require('../../lib/upload-r2');
        const { url, base64 } = await uploadAvatar(req.file.buffer, authUser?.id || 'unknown');

        // Save to both auth_users.avatar_url (used by nav middleware) and
        // member_profiles.avatar_url (used by public profile, directory, etc.)
        const { updateUserAvatarUrl } = require('../../db/users');
        const { upsertProfile } = require('../../db/profiles');

        if (authUser?.id) {
          await updateUserAvatarUrl(authUser.id, url).catch(() => {});
        }
        await upsertProfile(email, { avatar_url: url }).catch(() => {});

        res.json({ success: true, avatar_url: url, isBase64: base64 });
      } catch (err) {
        console.error('[/api/me/avatar POST]', err);
        res.status(500).json({ error: 'Failed to upload avatar.' });
      }
    },
  ];
})());

// DELETE /api/me/avatar — remove avatar
router.delete('/avatar', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Not authenticated' });

    const { getUserByEmail, updateUserAvatarUrl } = require('../../db/users');
    const { upsertProfile } = require('../../db/profiles');

    const authUser = await getUserByEmail(email).catch(() => null);
    if (authUser?.id) await updateUserAvatarUrl(authUser.id, null).catch(() => {});
    await upsertProfile(email, { avatar_url: null }).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    console.error('[/api/me/avatar DELETE]', err);
    res.status(500).json({ error: 'Failed to remove avatar.' });
  }
});

module.exports = router;