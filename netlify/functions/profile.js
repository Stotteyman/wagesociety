// /api/profile — GET own profile, PUT to update it. Requires auth.
const { getAuthContext, getServiceClient, json, isConfigured } = require('./_auth');

const EDITABLE = ['display_name', 'bio', 'skills', 'primary_platform', 'avatar_url', 'username'];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (!isConfigured()) return json(500, { error: 'Supabase not configured' });

  const { user } = await getAuthContext(event);
  if (!user) return json(401, { error: 'Not authenticated' });
  const svc = getServiceClient();

  if (event.httpMethod === 'GET') {
    const { data, error } = await svc.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) return json(500, { error: error.message });
    return json(200, { profile: data });
  }

  if (event.httpMethod === 'PUT') {
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON body' }); }

    const updates = {};
    for (const k of EDITABLE) if (k in body) updates[k] = body[k];
    if (updates.username) {
      updates.username = String(updates.username).toLowerCase().trim();
      if (!/^[a-z0-9_]{3,30}$/.test(updates.username)) return json(400, { error: 'Username must be 3–30 chars: a–z, 0–9, _' });
      const { data: taken } = await svc.from('profiles').select('id').eq('username', updates.username).neq('id', user.id).maybeSingle();
      if (taken) return json(409, { error: 'Username is taken' });
    }
    if (Object.keys(updates).length === 0) return json(400, { error: 'No editable fields provided' });

    const { data, error } = await svc.from('profiles').update(updates).eq('id', user.id).select().maybeSingle();
    if (error) return json(500, { error: error.message });
    return json(200, { profile: data });
  }

  return json(405, { error: 'Method not allowed' });
};
