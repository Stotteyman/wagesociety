// lib/middleware.js — Auth and membership middleware.
// requireAuth: checks session has userEmail
// requireMembership(tier): checks user has paid membership at least at required tier
// requirePasswordChange: redirects root admin to /settings/security until password changed
const { getUserMembership, hasTier } = require('../db/memberships');
const { getMustChangePassword } = require('../db/profiles');

function requireAuth(req, res, next) {
  if (!req.session?.userEmail) {
    if (req.accepts('html')) {
      req.session.returnTo = req.originalUrl;
      return res.redirect('/login');
    }
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
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

module.exports = { requireAuth, requireMembership, requirePasswordChange };