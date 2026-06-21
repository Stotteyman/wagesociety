// lib/middleware.js — Auth, membership, and permission middleware.
// requireAuth: checks session has userId or userEmail.
// requireMembership(tier): checks user has paid membership at least at required tier.
// requirePermission(key): checks user has a specific permission key.
// requireRole(name): checks user has a specific role.
// requirePasswordChange: redirects root admin to /settings/security until password changed.
const { getUserMembership, hasTier } = require('../db/memberships');
const { getMustChangePassword } = require('../db/profiles');
const { getUserAccess } = require('../db/roles');
const { getDiscordLinkByUserId } = require('../db/discord');
const { getServerOwnership } = require('../db/discord-servers');

// session.userEmail → old Supabase auth sessions
// session.userId + session.userEmail → new custom auth sessions
function requireAuth(req, res, next) {
  if (req.session?.userId || req.session?.userEmail) {
    return next();
  }
  if (req.accepts('html')) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  return res.status(401).json({ error: 'Authentication required' });
}

// Loads the user's roles + permissions from the new roles system into req.user.
// Run after requireAuth to enrich the session with permission data.
async function loadUserPermissions(req, res, next) {
  const userId = req.session?.userId;
  if (!userId) return next();

  try {
    const access = await getUserAccess(userId);
    req.user = req.user || {};
    req.user.id = userId;
    req.user.roles = access.roles;
    req.user.permissions = access.permissions;
    req.user.isSuperadmin = access.isSuperadmin;
    req.user.hasPermission = (key) => access.permissions.includes(key);
    req.user.hasRole = (name) => access.roles.includes(name);
  } catch (err) {
    console.error('[loadUserPermissions]', err);
    req.user = req.user || {};
    req.user.roles = [];
    req.user.permissions = [];
    req.user.hasPermission = () => false;
    req.user.hasRole = () => false;
  }
  next();
}

// Middleware factory: require a specific permission key.
function requirePermission(key) {
  return (req, res, next) => {
    if (!req.session?.userId && !req.session?.userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.user?.isSuperadmin) return next();
    if (req.user?.permissions?.includes(key)) return next();
    if (req.accepts('html')) {
      return res.status(403).render('pages/403', { message: `Permission '${key}' required` });
    }
    return res.status(403).json({ error: `Permission '${key}' required` });
  };
}

// Middleware factory: require a specific role.
function requireRole(name) {
  return (req, res, next) => {
    if (!req.session?.userId && !req.session?.userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.user?.isSuperadmin) return next();
    if (req.user?.roles?.includes(name)) return next();
    if (req.accepts('html')) {
      return res.status(403).render('pages/403', { message: `Role '${name}' required` });
    }
    return res.status(403).json({ error: `Role '${name}' required` });
  };
}

// Forces password change for the root admin account (must_change_password=true).
// Applies only to root@wagesociety.com. No other user is affected.
// Exempted routes: /settings/security (change form), /auth/logout, static assets.
const ALLOWED_PATHS = new Set([
  '/settings/security',
  '/auth/logout',
]);

function requirePasswordChange(req, res, next) {
  // Only applies to the root admin email
  if (req.session?.userEmail !== 'root@wagesociety.com') return next();

  // Allow certain paths without redirect
  if (ALLOWED_PATHS.has(req.path)) return next();
  // Allow /settings/security with any query string
  if (req.path === '/settings/security') return next();
  // Allow static assets (css, js, images)
  if (req.path.startsWith('/css/') || req.path.startsWith('/js/') ||
      req.path.startsWith('/images/') || req.path.startsWith('/fonts/')) return next();

  // Check flag and redirect if needed
  getMustChangePassword('root@wagesociety.com').then(needsChange => {
    if (needsChange) {
      req.session.returnTo = req.originalUrl;
      return res.redirect('/settings/security?force_change=1');
    }
    next();
  }).catch(() => next());
}

function requireMembership(tier = 'free') {
  return async (req, res, next) => {
    const email = req.session?.userEmail;
    if (!email) {
      if (req.accepts('html')) {
        req.session.returnTo = req.originalUrl;
        return res.redirect('/login');
      }
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const membership = await getUserMembership(email);
      if (!hasTier(membership, tier)) {
        if (req.accepts('html')) {
          return res.redirect('/memberships?upgrade=' + tier);
        }
        return res.status(403).json({
          error: `This content requires a ${tier} membership or higher`,
          requiredTier: tier,
        });
      }
      req.userMembership = membership;
      next();
    } catch (err) {
      console.error('[requireMembership]', err);
      res.status(500).json({ error: 'Failed to verify membership' });
    }
  };
}

// Require authentication for all /dashboard/* and /admin/* routes.
// Apply after loadUserPermissions so req.user.permissions/roles are available.
function requireDashboard(req, res, next) {
  if (!req.session?.userId && !req.session?.userEmail) {
    if (req.accepts('html')) {
      req.session.returnTo = req.originalUrl;
      return res.redirect('/login');
    }
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.userId && !req.session?.userEmail) {
    if (req.accepts('html')) {
      req.session.returnTo = req.originalUrl;
      return res.redirect('/login');
    }
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user?.isSuperadmin) return next();
  if (req.user?.permissions?.includes('users.manage')) return next();
  if (req.accepts('html')) {
    return res.status(403).render('pages/403', { message: 'Admin access required' });
  }
  return res.status(403).json({ error: 'Admin access required' });
}

// Middleware: redirect to /dashboard/discord/connect if user hasn't linked their Discord account.
function requireDiscordLinked(req, res, next) {
  const userId = req.session?.userId;
  if (!userId) {
    if (req.accepts('html')) {
      req.session.returnTo = req.originalUrl;
      return res.redirect('/login');
    }
    return res.status(401).json({ error: 'Authentication required' });
  }

  getDiscordLinkByUserId(userId)
    .then((link) => {
      if (!link) {
        if (req.accepts('html')) {
          return res.redirect('/dashboard/discord/connect?step=oauth');
        }
        return res.status(403).json({ error: 'Discord account not linked' });
      }
      req.discordLink = link;
      next();
    })
    .catch((err) => {
      console.error('[requireDiscordLinked]', err);
      next(); // Fail open — don't block on DB errors
    });
}

// Middleware factory: require the authenticated user owns the Discord server (by guildId).
// guildId comes from req.params.guildId.
function requireServerOwner(req, res, next) {
  const userId = req.session?.userId;
  const guildId = req.params?.guildId;

  if (!userId) {
    if (req.accepts('html')) {
      req.session.returnTo = req.originalUrl;
      return res.redirect('/login');
    }
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!guildId) return res.status(400).json({ error: 'guildId required' });

  getServerOwnership(guildId, userId)
    .then((server) => {
      if (!server) {
        if (req.accepts('html')) {
          return res.status(403).render('pages/403', { message: 'You do not own this Discord server' });
        }
        return res.status(403).json({ error: 'Not your server' });
      }
      req.discordServer = server;
      next();
    })
    .catch((err) => {
      console.error('[requireServerOwner]', err);
      res.status(500).json({ error: 'Failed to verify server ownership' });
    });
}

// Throttled last_seen_at writer — updates auth_users.last_seen_at at most once
// per 5 minutes per user so the homepage "Community members online" stat works.
const _lastSeenMap = new Map();
function trackLastSeen(req, res, next) {
  const userId = req.session?.userId;
  if (!userId) return next();
  const now = Date.now();
  const last = _lastSeenMap.get(userId) || 0;
  if (now - last > 5 * 60 * 1000) {
    _lastSeenMap.set(userId, now);
    const { touchLastSeen } = require('../db/users');
    touchLastSeen(userId).catch(() => {});
  }
  next();
}

module.exports = {
  requireAuth,
  loadUserPermissions,
  requirePermission,
  requireRole,
  requirePasswordChange,
  requireMembership,
  requireDashboard,
  requireAdmin,
  requireDiscordLinked,
  requireServerOwner,
  trackLastSeen,
};