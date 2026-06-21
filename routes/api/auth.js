// routes/api/auth.js — Session read/destroy helpers only.
// Owns: GET /api/auth/me (session user), POST /api/auth/logout.
// Does NOT own: Supabase magic-link flow (routes/auth.js), credential-based login.
const express = require('express');
const router = express.Router();
const { getProfileByEmail } = require('../../db/profiles');
const { getMemberAccess } = require('../../db/orgAccess');
const { getUserAccess } = require('../../db/roles');

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    const userId = req.session?.userId;
    if (!email) return res.json({ user: null });
    const profile = await getProfileByEmail(email);
    const access = await getMemberAccess(email);

    // Merge new-system permissions (users.manage, etc.) into access response
    // so frontend auth checks work for both org-level and new-system admins
    let newSystemPerms = { isSuperadmin: false, permissions: [] };
    if (userId) {
      try {
        const ns = await getUserAccess(userId);
        newSystemPerms = { isSuperadmin: ns.isSuperadmin, permissions: ns.permissions };
      } catch (_) {}
    }

    // Get user's connected OAuth platforms from auth_users.id (NOT member_profiles.id)
    let connectedPlatforms = [];
    const { getUserByEmail } = require('../../db/users');
    const authUser = await getUserByEmail(email).catch(() => null);
    if (authUser) {
      const { getUserConnections } = require('../../db/oauth-providers');
      const conns = await getUserConnections(authUser.id);
      connectedPlatforms = conns.map(c => c.provider);
      // Google connection = YouTube streaming capability
      if (connectedPlatforms.includes('google') && !connectedPlatforms.includes('youtube')) {
        connectedPlatforms.push('youtube');
      }
      // Also check discord_links (Discord uses a separate table with integer user_id from users table)
      if (!connectedPlatforms.includes('discord')) {
        const { getUserIdByEmail, getDiscordLinkByUserId } = require('../../db/discord');
        const discordUserId = await getUserIdByEmail(email).catch(() => null);
        if (discordUserId) {
          const discordLink = await getDiscordLinkByUserId(discordUserId).catch(() => null);
          if (discordLink) connectedPlatforms.push('discord');
        }
      }
    }

    res.json({
      user: profile ? {
        email,
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        bio: profile.bio,
        primary_platform: profile.primary_platform || null,
        featured_youtube_channel_id: profile.featured_youtube_channel_id || null,
      } : { email },
      connectedPlatforms,
      access: {
        ...access,
        isSuperadmin: newSystemPerms.isSuperadmin || access.isSuperadmin,
        permissions: [...new Set([...(newSystemPerms.permissions || []), ...(access.permissions || [])])],
      },
    });
  } catch (err) {
    console.error('[/api/auth/me]', err);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

module.exports = router;
