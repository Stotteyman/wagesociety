// POST /api/checkout { planSlug, cycle } — membership checkout redirect.
// Validates the plan against membership_plans (source of truth), records a
// pending session so the webhook can activate the membership, and returns
// the Stripe Payment Link URL (with client_reference_id) for the client to redirect to.
const { getAuthContext, getServiceClient, isConfigured, json } = require('./_auth');
const { SUBSCRIPTION_LINKS_MONTHLY, SUBSCRIPTION_LINKS_ANNUAL } = require('./_stripe-config');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!isConfigured()) return json(500, { error: 'Supabase not configured' });

  const { user } = await getAuthContext(event);
  if (!user || !user.email) return json(401, { error: 'Must be logged in to upgrade' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON body' }); }
  const { planSlug, cycle } = body;
  if (!planSlug || !cycle) return json(400, { error: 'planSlug and cycle required' });
  if (!['monthly', 'annual'].includes(cycle)) return json(400, { error: 'cycle must be monthly or annual' });

  const svc = getServiceClient();

  const { data: plan, error: planErr } = await svc
    .from('membership_plans')
    .select('slug, price_cents, is_active')
    .eq('slug', planSlug)
    .maybeSingle();
  if (planErr) return json(500, { error: planErr.message });
  if (!plan || !plan.is_active || plan.price_cents === 0) {
    return json(400, { error: `Invalid plan slug: ${planSlug}` });
  }

  const links = cycle === 'annual' ? SUBSCRIPTION_LINKS_ANNUAL : SUBSCRIPTION_LINKS_MONTHLY;
  const baseUrl = links[planSlug];
  if (!baseUrl) return json(400, { error: `No payment link for ${planSlug} ${cycle}` });

  const { error: insertErr } = await svc.from('checkout_sessions').insert({
    user_id: user.id,
    user_email: user.email.toLowerCase(),
    plan_slug: planSlug,
    billing_cycle: cycle,
    stripe_link_url: baseUrl,
  });
  if (insertErr) console.error('[checkout] Failed to record pending session:', insertErr.message);

  const redirectUrl = `${baseUrl}?client_reference_id=${encodeURIComponent(user.email)}`;
  return json(200, { redirectUrl });
};
