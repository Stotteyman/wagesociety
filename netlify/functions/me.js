// GET /api/me — the caller's profile + role. Requires a valid Supabase token.
const { getAuthContext, getServiceClient, json, isConfigured } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (!isConfigured()) return json(500, { error: 'Supabase not configured' });
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const { user, role } = await getAuthContext(event);
  if (!user) return json(401, { error: 'Not authenticated' });

  const svc = getServiceClient();
  const { data: profile, error } = await svc
    .from('profiles')
    .select('id, email, username, display_name, avatar_url, bio, tier, referral_code, referral_points, total_referrals, referral_tier')
    .eq('id', user.id)
    .maybeSingle();
  if (error) return json(500, { error: error.message });

  return json(200, { user: { id: user.id, email: user.email }, role, profile });
};
