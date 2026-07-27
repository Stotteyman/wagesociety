// GET /api/connect-status + user JWT.
// Reports whether the creator can actually take money yet, refreshing our cached
// copy from Stripe. Onboarding can be abandoned halfway, so the local row is not
// trustworthy on its own.
const { getAuthContext, getServiceClient, isConfigured, json } = require('./_auth');

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (!isConfigured()) return json(500, { error: 'Supabase not configured' });

  const { user } = await getAuthContext(event);
  if (!user) return json(401, { error: 'Not authenticated' });

  const svc = getServiceClient();
  const { data: row } = await svc
    .from('creator_payout_accounts')
    .select('stripe_account_id, charges_enabled, payouts_enabled, details_submitted')
    .eq('creator_id', user.id)
    .maybeSingle();

  if (!row) return json(200, { ok: true, connected: false, canSell: false });
  if (!STRIPE_SECRET) {
    return json(200, { ok: true, connected: true, canSell: row.charges_enabled, ...row });
  }

  const res = await fetch(`https://api.stripe.com/v1/accounts/${row.stripe_account_id}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET}` },
  });
  const acct = await res.json().catch(() => ({}));
  if (!res.ok) {
    return json(200, { ok: true, connected: true, canSell: row.charges_enabled, stale: true, ...row });
  }

  const fresh = {
    charges_enabled: Boolean(acct.charges_enabled),
    payouts_enabled: Boolean(acct.payouts_enabled),
    details_submitted: Boolean(acct.details_submitted),
    updated_at: new Date().toISOString(),
  };
  await svc.from('creator_payout_accounts').update(fresh).eq('creator_id', user.id);

  return json(200, {
    ok: true,
    connected: true,
    canSell: fresh.charges_enabled,
    ...fresh,
    requirementsDue: (acct.requirements?.currently_due || []).length,
  });
};
