// GET /api/app-entitlement — "may this install keep running?"
//
// The desktop app calls this on launch and periodically. It is the whole licence
// check: no active membership, no tool.
//
// Authenticated with the app's own token (Bearer), not a Supabase JWT — the app never
// holds the member's real credentials.
//
// Deliberately returns a `grace_hours` budget rather than demanding connectivity. A
// creator on a plane should not lose their editor; a cancelled member should lose it
// within a day or so.
const crypto = require('node:crypto');
const { getServiceClient, isConfigured, json } = require('./_auth');

const TIER_ORDER = ['free', 'creator', 'pro', 'elite', 'unlimited'];
const tierRank = (slug) => TIER_ORDER.indexOf(String(slug || '').toLowerCase());
const STAFF_ROLES = new Set(['staff', 'manager', 'admin', 'superadmin']);

const APPS = {
  'clip-studio': { name: 'Clip Studio', minTier: 'creator' },
};

const GRACE_HOURS = 72;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (!isConfigured()) return json(500, { error: 'Supabase not configured' });

  const token = (event.headers.authorization || event.headers.Authorization || '')
    .replace(/^Bearer\s+/i, '').trim();
  if (!token) return json(401, { entitled: false, reason: 'no_token' });

  const svc = getServiceClient();

  const { data: sess } = await svc
    .from('app_sessions')
    .select('id, user_id, app_slug, revoked_at')
    .eq('token_hash', sha256(token))
    .maybeSingle();

  if (!sess) return json(401, { entitled: false, reason: 'unknown_token' });
  if (sess.revoked_at) return json(403, { entitled: false, reason: 'revoked', detail: 'This device was signed out from your account.' });

  const app = APPS[sess.app_slug] || APPS['clip-studio'];

  const { data: profile } = await svc
    .from('profiles')
    .select('tier, username, display_name, is_suspended')
    .eq('id', sess.user_id)
    .maybeSingle();

  if (!profile) return json(403, { entitled: false, reason: 'no_profile' });
  if (profile.is_suspended) return json(403, { entitled: false, reason: 'suspended' });

  // Staff keep access regardless of tier, mirroring tool-download.
  let role = 'member';
  const { data: roleRows } = await svc.from('user_roles').select('roles(name)').eq('user_id', sess.user_id);
  if (roleRows?.length) role = roleRows.map((r) => r.roles?.name).filter(Boolean)[0] || 'member';

  const tier = profile.tier || 'free';
  const entitled = STAFF_ROLES.has(role) || tierRank(tier) >= tierRank(app.minTier);

  await svc.from('app_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', sess.id);

  if (!entitled) {
    return json(403, {
      entitled: false,
      reason: 'upgrade_required',
      detail: `${app.name} is included with Creator and above.`,
      tier,
      upgrade_url: `${process.env.APP_URL || 'https://wagesociety.com'}/plans`,
    });
  }

  return json(200, {
    entitled: true,
    app: sess.app_slug,
    tier,
    grace_hours: GRACE_HOURS,
    member: profile.display_name || profile.username,
    checked_at: new Date().toISOString(),
  });
};
