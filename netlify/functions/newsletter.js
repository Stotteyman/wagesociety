// POST /api/newsletter { email } — public newsletter subscribe.
const { getServiceClient, json, isConfigured } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (!isConfigured()) return json(500, { error: 'Supabase not configured' });
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let email = '';
  try { email = String(JSON.parse(event.body || '{}').email || '').toLowerCase().trim(); } catch { return json(400, { error: 'Invalid JSON body' }); }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: 'Enter a valid email' });

  const svc = getServiceClient();
  const { error } = await svc.from('newsletter_subscriptions').upsert({ email, source: 'site' }, { onConflict: 'email' });
  if (error) return json(500, { error: error.message });
  return json(200, { subscribed: true });
};
