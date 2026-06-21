// middleware/referral.js — Captures ?ref=WAGE-XXXXXX from any URL.
// Stores in session (primary) + cookie (backup, 30-day expiry).
// Mounted early in server.js so it runs before any route handler.
const REF_COOKIE = 'referral_code';
const REF_PREFIX = 'WAGE-';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function captureReferral(req, res, next) {
  const raw = req.query.ref;
  if (!raw || typeof raw !== 'string') {
    // Fallback: check existing cookie if no ?ref in URL
    if (!req.session.referral_code && req.cookies?.[REF_COOKIE]) {
      req.session.referral_code = req.cookies[REF_COOKIE];
    }
    return next();
  }

  const code = raw.toUpperCase().trim();
  // Require full WAGE-XXXXXX format (6 chars after prefix)
  if (!/^WAGE-[A-Z0-9]{6}$/.test(code)) return next();

  // Store in session (primary)
  req.session.referral_code = code;
  // Set cookie as backup for cross-session persistence
  res.cookie(REF_COOKIE, code, {
    maxAge: MAX_AGE_MS,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });

  next();
}

module.exports = captureReferral;