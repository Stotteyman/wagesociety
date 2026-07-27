// GET /api/check-username?username=foo — availability check. Public.
const { getServiceClient, json, isConfigured } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (!isConfigured()) return json(500, { error: 'Supabase not configured' });
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const username = String(event.queryStringParameters?.username || '').toLowerCase().trim();
  if (!/^[a-z0-9_]{3,30}$/.test(username)) return json(200, { available: false, reason: 'invalid' });

  const svc = getServiceClient();
  const { data, error } = await svc.from('profiles').select('id').eq('username', username).maybeSingle();
  if (error) return json(500, { error: error.message });
  return json(200, { available: !data });
};
