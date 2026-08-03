// POST /api/checkout { planSlug, cycle } — membership checkout.
//
// This creates a Stripe Checkout Session on W.A.G.E.'s OWN account.
//
// It used to redirect to static buy.stripe.com Payment Links hardcoded in
// _stripe-config.js. Those links are owned by acct_1TaNvdRSi3U4FW38 — a
// Polsia-era account this project holds no key for (our key 403s on it) — and
// they render that account's logo, which is where the stray branding came from.
// The branding was the visible symptom; the real problem was that every
// membership payment settled into someone else's account, and our webhook
// (registered on our own account) could never see the event, so no tier and no
// Discord role would ever be granted.
//
// Prices come from membership_plans, never from the request body.
const { getAuthContext, getServiceClient, isConfigured, json } = require('./_auth');
const { returnBase } = require('./_stripe-config');

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;

/** Annual is billed at ten months, i.e. two months free. */
const ANNUAL_MULTIPLIER = 10;
const TRIAL_DAYS = 7;

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
  if (!user) return json(401, { error: 'Must be logged in to upgrade' });
  // Discord does not always give us an email, and the whole billing chain is keyed on
  // one — Stripe's receipt, and the webhook that matches a payment back to an account.
  // Say so plainly instead of returning a "not logged in" error to someone who is.
  if (!user.email) {
    return json(400, {
      error: 'email_required',
      detail: 'Add an email address in Settings first — we need one to send your receipt and activate your membership.',
    });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON body' }); }
  const { planSlug, cycle } = body;
  if (!planSlug || !cycle) return json(400, { error: 'planSlug and cycle required' });
  if (!['monthly', 'annual'].includes(cycle)) return json(400, { error: 'cycle must be monthly or annual' });

  const svc = getServiceClient();

  const { data: plan, error: planErr } = await svc
    .from('membership_plans')
    .select('slug, name, price_cents, is_active')
    .eq('slug', planSlug)
    .maybeSingle();
  if (planErr) return json(500, { error: planErr.message });
  if (!plan || !plan.is_active || plan.price_cents === 0) {
    return json(400, { error: `Invalid plan slug: ${planSlug}` });
  }

  const annual = cycle === 'annual';
  const email = user.email.toLowerCase();

  // What this person actually pays, after founder and early-member entitlements.
  //
  // Priced in the database, never here and never from the request body: ws_svc_price_for
  // is the single source of truth, and the plans page renders the same function's answer,
  // so the figure on screen and the figure charged cannot drift apart.
  const { data: quote, error: quoteErr } = await svc.rpc('ws_svc_price_for', {
    p_user_id: user.id, p_plan_slug: planSlug, p_cycle: cycle,
  });
  if (quoteErr) return json(500, { error: quoteErr.message });
  if (!quote?.ok) return json(400, { error: `Invalid plan slug: ${planSlug}` });

  const amount = Number(quote.amount_cents);
  const listPrice = annual ? plan.price_cents * ANNUAL_MULTIPLIER : plan.price_cents;

  /*
   * Free means free — no card, no Stripe, no $0 subscription that still needs a payment
   * method and can still "fail". A founder, and every early member before launch, gets
   * the tier granted outright and lands back on the dashboard with it already active.
   *
   * ws_svc_apply_badge_entitlements only ever RAISES a tier, so it cannot be used to
   * grant something above what the entitlement covers; the tier is set here from the plan
   * the price was quoted for, which is the plan the caller asked for and was told cost
   * nothing.
   */
  if (amount === 0) {
    const { error: grantErr } = await svc.rpc('ws_svc_grant_free_membership', {
      p_user_id: user.id, p_plan_slug: planSlug, p_cycle: cycle, p_reason: quote.reason,
    });
    if (grantErr) return json(500, { error: grantErr.message });
    return json(200, {
      free: true,
      reason: quote.reason,
      redirectUrl: `${returnBase(event)}/dashboard?upgraded=${encodeURIComponent(plan.slug)}&free=${encodeURIComponent(quote.reason)}`,
    });
  }

  const session = await stripe('checkout/sessions', {
    mode: 'subscription',
    customer_email: email,
    // client_reference_id is what the webhook falls back to when matching a
    // payment to an account, so it has to be the email, not the user id.
    client_reference_id: email,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(amount),
    'line_items[0][price_data][recurring][interval]': annual ? 'year' : 'month',
    'line_items[0][price_data][product_data][name]': `W.A.G.E. Society — ${plan.name}`,
    // Say why it is cheaper on the Stripe page itself. A member who sees $15.00 where the
    // site advertises $24.99 should not have to work out whether something is wrong.
    'line_items[0][price_data][product_data][description]':
      amount < listPrice
        ? `${plan.name} membership, billed ${annual ? 'yearly' : 'monthly'}. `
          + `Early member price: $${(listPrice / 100).toFixed(2)} less $${(Number(quote.discount_cents) / 100).toFixed(2)} `
          + `for the Creator membership you already have. Cancel anytime.`
        : `${plan.name} membership, billed ${annual ? 'yearly' : 'monthly'}. Cancel anytime.`,
    'line_items[0][quantity]': '1',
    'subscription_data[trial_period_days]': String(TRIAL_DAYS),
    // Repeated onto the subscription so later customer.subscription.* events can
    // resolve the plan without guessing from the amount.
    'subscription_data[metadata][plan_slug]': plan.slug,
    'subscription_data[metadata][email]': email,
    'subscription_data[metadata][billing_cycle]': annual ? 'annual' : 'monthly',
    'metadata[type]': 'membership',
    'metadata[plan_slug]': plan.slug,
    'metadata[billing_cycle]': annual ? 'annual' : 'monthly',
    'metadata[client_reference_id]': email,
    allow_promotion_codes: 'true',
    success_url: `${returnBase(event)}/dashboard?upgraded=${encodeURIComponent(plan.slug)}`,
    cancel_url: `${returnBase(event)}/settings?upgrade=cancelled`,
  });

  if (!session.ok || !session.body?.url) {
    return json(400, { error: 'stripe_failed', detail: session.body?.error?.message });
  }

  const { error: insertErr } = await svc.from('checkout_sessions').insert({
    user_id: user.id,
    user_email: email,
    plan_slug: planSlug,
    billing_cycle: cycle,
    stripe_link_url: session.body.url,
  });
  if (insertErr) console.error('[checkout] Failed to record pending session:', insertErr.message);

  return json(200, { redirectUrl: session.body.url });
};
