// POST /api/video-checkout { videoId } | { creatorUsername, mode: 'subscribe' }
// + user JWT. Creates a Stripe Checkout Session that pays the creator directly
// and takes the platform fee as an application fee.
//
// Prices are read from the database, never from the request body — a client that
// could name its own price would be able to buy a $50 video for a penny.
const { getAuthContext, getServiceClient, isConfigured, json } = require('./_auth');
const { APP_URL } = require('./_stripe-config');
const { PLATFORM_FEE_PERCENT, platformFeeCents } = require('./_platform');

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
  if (!user) return json(401, { error: 'Sign in to buy this.' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad body' }); }
  const svc = getServiceClient();

  // ── Subscribe to a creator ────────────────────────────────────────────────
  if (body.mode === 'subscribe') {
    const { data: creator } = await svc
      .from('profiles')
      .select('id, username, display_name, subscription_price_cents')
      .eq('username', body.creatorUsername)
      .maybeSingle();
    if (!creator) return json(404, { error: 'No creator by that name.' });
    if (!creator.subscription_price_cents) {
      return json(400, { error: 'not_for_sale', detail: 'This creator does not offer a subscription.' });
    }
    if (creator.id === user.id) return json(400, { error: 'You cannot subscribe to yourself.' });

    const acct = await payoutAccount(svc, creator.id);
    if (!acct) return json(400, { error: 'creator_not_ready', detail: `${creator.display_name || creator.username} has not finished setting up payouts yet.` });

    const session = await stripe('checkout/sessions', {
      mode: 'subscription',
      customer_email: user.email || '',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(creator.subscription_price_cents),
      'line_items[0][price_data][recurring][interval]': 'month',
      'line_items[0][price_data][product_data][name]': `${creator.display_name || creator.username} — membership`,
      'line_items[0][quantity]': '1',
      'subscription_data[application_fee_percent]': String(PLATFORM_FEE_PERCENT),
      'subscription_data[transfer_data][destination]': acct,
      'metadata[kind]': 'creator_subscription',
      'metadata[creator_id]': creator.id,
      'metadata[subscriber_id]': user.id,
      success_url: `${APP_URL}/creators/${creator.username}?subscribed=1`,
      cancel_url: `${APP_URL}/creators/${creator.username}`,
    });
    if (!session.ok) return json(400, { error: 'stripe_failed', detail: session.body?.error?.message });

    await svc.from('creator_subscriptions').upsert({
      creator_id: creator.id,
      subscriber_id: user.id,
      price_cents: creator.subscription_price_cents,
      status: 'pending',
    }, { onConflict: 'creator_id,subscriber_id' });

    return json(200, { ok: true, url: session.body.url });
  }

  // ── Buy a single video ────────────────────────────────────────────────────
  const { data: video } = await svc
    .from('videos')
    .select('id, title, price_cents, creator_id, is_published')
    .eq('id', body.videoId)
    .maybeSingle();
  if (!video || !video.is_published) return json(404, { error: 'That video is not available.' });
  if (!video.price_cents) return json(400, { error: 'not_for_sale', detail: 'This video is not sold individually.' });
  if (video.creator_id === user.id) return json(400, { error: 'This is your own video.' });

  const { data: already } = await svc
    .from('video_purchases')
    .select('id').eq('video_id', video.id).eq('buyer_id', user.id).eq('status', 'paid').maybeSingle();
  if (already) return json(400, { error: 'already_owned', detail: 'You already own this one.' });

  const acct = await payoutAccount(svc, video.creator_id);
  if (!acct) return json(400, { error: 'creator_not_ready', detail: 'This creator has not finished setting up payouts yet.' });

  const fee = platformFeeCents(video.price_cents);
  const session = await stripe('checkout/sessions', {
    mode: 'payment',
    customer_email: user.email || '',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(video.price_cents),
    'line_items[0][price_data][product_data][name]': video.title,
    'line_items[0][quantity]': '1',
    'payment_intent_data[application_fee_amount]': String(fee),
    'payment_intent_data[transfer_data][destination]': acct,
    'metadata[kind]': 'video_purchase',
    'metadata[video_id]': video.id,
    'metadata[buyer_id]': user.id,
    success_url: `${APP_URL}/watch/${video.id}?purchased=1`,
    cancel_url: `${APP_URL}/watch/${video.id}`,
  });
  if (!session.ok) return json(400, { error: 'stripe_failed', detail: session.body?.error?.message });

  await svc.from('video_purchases').insert({
    video_id: video.id,
    buyer_id: user.id,
    amount_cents: video.price_cents,
    platform_fee_cents: fee,
    stripe_session_id: session.body.id,
    status: 'pending',
  });

  return json(200, { ok: true, url: session.body.url });
};

async function payoutAccount(svc, creatorId) {
  const { data } = await svc
    .from('creator_payout_accounts')
    .select('stripe_account_id, charges_enabled')
    .eq('creator_id', creatorId)
    .maybeSingle();
  return data?.charges_enabled ? data.stripe_account_id : null;
}
