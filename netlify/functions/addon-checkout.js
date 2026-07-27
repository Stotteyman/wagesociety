// POST /api/addon-checkout { slug } + user JWT.
//
// Add-ons are deliberately independent of membership: no subscription is
// required to buy one, and nothing here reads the buyer's tier. An account is
// still needed, because the work has to be delivered to somebody.
//
// The session is created on W.A.G.E.'s own Stripe account, and the price is read
// from the database so a client cannot name its own.
const { getAuthContext, getServiceClient, isConfigured, json } = require('./_auth');
const { APP_URL } = require('./_stripe-config');

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;

const stripe = async (path, params) => {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!isConfigured()) return json(500, { error: 'Supabase not configured' });
  if (!STRIPE_SECRET) return json(500, { error: 'not_configured', detail: 'STRIPE_SECRET_KEY is missing.' });

  const { user } = await getAuthContext(event);
  if (!user || !user.email) return json(401, { error: 'Sign in to order this.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON body' }); }
  if (!body.slug) return json(400, { error: 'slug required' });

  const svc = getServiceClient();
  const { data: addon } = await svc
    .from('addons')
    .select('slug, name, description, price_cents, billing, is_active')
    .eq('slug', body.slug)
    .maybeSingle();

  if (!addon || !addon.is_active) return json(404, { error: 'That add-on is not available.' });

  const recurring = addon.billing === 'monthly';
  const email = user.email.toLowerCase();

  const params = {
    mode: recurring ? 'subscription' : 'payment',
    customer_email: email,
    client_reference_id: email,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(addon.price_cents),
    'line_items[0][price_data][product_data][name]': `W.A.G.E. Society — ${addon.name}`,
    'line_items[0][price_data][product_data][description]': addon.description || '',
    'line_items[0][quantity]': '1',
    'metadata[kind]': 'addon_purchase',
    'metadata[addon_slug]': addon.slug,
    'metadata[buyer_id]': user.id,
    allow_promotion_codes: 'true',
    success_url: `${APP_URL}/plans?ordered=${encodeURIComponent(addon.slug)}`,
    cancel_url: `${APP_URL}/plans`,
  };

  if (recurring) {
    params['line_items[0][price_data][recurring][interval]'] = 'month';
    params['subscription_data[metadata][kind]'] = 'addon_purchase';
    params['subscription_data[metadata][addon_slug]'] = addon.slug;
    params['subscription_data[metadata][buyer_id]'] = user.id;
  }

  const session = await stripe('checkout/sessions', params);
  if (!session.ok || !session.body?.url) {
    return json(400, { error: 'stripe_failed', detail: session.body?.error?.message });
  }

  const { error } = await svc.from('addon_purchases').insert({
    buyer_id: user.id,
    addon_slug: addon.slug,
    amount_cents: addon.price_cents,
    billing: addon.billing,
    stripe_session_id: session.body.id,
    status: 'pending',
  });
  if (error) console.error('[addon-checkout] could not record order:', error.message);

  return json(200, { ok: true, url: session.body.url });
};
