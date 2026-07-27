// POST /api/connect-onboard + user JWT.
// Creates (or reuses) the creator's Stripe Connect Express account and returns a
// fresh onboarding link.
//
// Connect is what lets a buyer pay a creator directly while W.A.G.E. takes its
// cut as an application fee. The money never lands in the platform account, so we
// are not holding anyone else's funds and Stripe issues the creator's 1099.
const { getAuthContext, getServiceClient, isConfigured, json } = require('./_auth');
const { returnBase } = require('./_stripe-config');

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const STRIPE_API = 'https://api.stripe.com/v1';

const stripe = async (path, params, method = 'POST') => {
  const res = await fetch(`${STRIPE_API}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!isConfigured()) return json(500, { error: 'Supabase not configured' });
  if (!STRIPE_SECRET) return json(500, { error: 'not_configured', detail: 'STRIPE_SECRET_KEY is missing.' });

  const { user } = await getAuthContext(event);
  if (!user) return json(401, { error: 'Not authenticated' });

  const svc = getServiceClient();
  const { data: existing } = await svc
    .from('creator_payout_accounts')
    .select('stripe_account_id')
    .eq('creator_id', user.id)
    .maybeSingle();

  let accountId = existing?.stripe_account_id;

  if (!accountId) {
    const created = await stripe('accounts', {
      type: 'express',
      email: user.email || '',
      'capabilities[transfers][requested]': 'true',
      'capabilities[card_payments][requested]': 'true',
      'business_profile[product_description]': 'Paid video sold through W.A.G.E. Society',
      'metadata[wage_user_id]': user.id,
    });
    if (!created.ok) {
      return json(400, { error: 'stripe_account_failed', detail: created.body?.error?.message });
    }
    accountId = created.body.id;

    const { error } = await svc.from('creator_payout_accounts').insert({
      creator_id: user.id,
      stripe_account_id: accountId,
    });
    if (error) return json(500, { error: 'store_failed', detail: error.message });
  }

  // Account links are single-use and short-lived, so one is minted per attempt.
  const link = await stripe('account_links', {
    account: accountId,
    refresh_url: `${returnBase(event)}/settings?connect=retry`,
    return_url: `${returnBase(event)}/settings?connect=done`,
    type: 'account_onboarding',
  });
  if (!link.ok) return json(400, { error: 'stripe_link_failed', detail: link.body?.error?.message });

  return json(200, { ok: true, url: link.body.url });
};
