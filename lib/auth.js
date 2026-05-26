// lib/auth.js — User provisioning on OAuth login.
// Handles Supabase Auth (magic link, Google, Discord) user provisioning.
// Does NOT own session management (server.js) or roles (db/orgAccess.js).
const { pool } = require('../db/index');
const { upsertProfile } = require('../db/profiles');
const { upsertMembership, getUserMembership } = require('../db/memberships');
const { getMemberRole } = require('../db/orgAccess');

// SUPERADMIN_EMAIL env var is authoritative. Fallback retains existing owner access
// if the env var is not yet set (prevents accidental lockout during migration).
const SUPERADMIN_EMAILS = new Set(
  [process.env.SUPERADMIN_EMAIL].filter(Boolean)
);

// Ensure user exists in users table; create if not
async function ensureUser({ email, name, avatarUrl }) {
  const result = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [email.toLowerCase()]
  );
  if (result.rows.length === 0) {
    await pool.query(
      'INSERT INTO users (email, name, avatar_url) VALUES ($1, $2, $3)',
      [email.toLowerCase(), name || email.split('@')[0], avatarUrl || null]
    );
  } else {
    await pool.query(
      'UPDATE users SET name = COALESCE(name, $2), avatar_url = COALESCE(avatar_url, $3) WHERE email = $1',
      [email.toLowerCase(), name || null, avatarUrl || null]
    );
  }
}

// Provision a new user on first OAuth login
// stotteyman@gmail.com → superadmin role; everyone else → guest role
// Also assigns FREE membership automatically
async function onFirstOAuthLogin({ email, name, avatarUrl, role = 'user' }) {
  const isSuperadmin = SUPERADMIN_EMAILS.has(email.toLowerCase());
  const effectiveRole = isSuperadmin ? 'superadmin' : role;

  await ensureUser({ email, name, avatarUrl });
  await upsertProfile(email, {
    display_name: name || email.split('@')[0],
    avatar_url: avatarUrl,
    ...(effectiveRole !== 'user' ? { role: effectiveRole } : {}),
  });

  // Auto-assign FREE membership on first login
  try {
    await upsertMembership({
      email,
      planSlug: 'free',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      status: 'active',
    });
  } catch (err) {
    // Ignore duplicate key — free membership already exists
    if (!err.message.includes('duplicate')) console.error('[onFirstOAuthLogin] membership:', err.message);
  }

  return { isSuperadmin, role: effectiveRole };
}

// Load session user info (role + membership)
async function getSessionUser(email) {
  if (!email) return null;
  const role = await getMemberRole(email);
  const membership = await getUserMembership(email);
  return { email, role, membership };
}

module.exports = { SUPERADMIN_EMAILS, ensureUser, onFirstOAuthLogin, getSessionUser };