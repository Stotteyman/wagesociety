// POST /api/stripe-webhook — Stripe webhook (public, signature-verified).
// Handles: checkout.session.completed (points / donations / membership
// activation) and subscription lifecycle events (create/update/delete, incl.
// 7-day trial). Ported from routes/api/webhooks.js onto Supabase.
const crypto = require('crypto');
const { getServiceClient, isConfigured, json } = require('./_auth');
const { inferBillingCycle, inferTierFromAmount, inferTierFromPriceId } = require('./_stripe-config');

const SIGNING_SECRET = process.env.STRIPE_SIGNING_SECRET;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function verifySignature(rawBody, sigHeader) {
  if (!SIGNING_SECRET) return true; // not configured yet — accept (dev/staging only)
  if (!sigHeader) return false;
  const parts = sigHeader.split(',');
  const tp = parts.find((p) => p.startsWith('t='));
  const sp = parts.find((p) => p.startsWith('v1='));
  if (!tp || !sp) return false;
  const timestamp = parseInt(tp.slice(2), 10);
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const payload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');
  const buf1 = Buffer.from(expected);
  const buf2 = Buffer.from(sp.slice(3));
  return buf1.length === buf2.length && crypto.timingSafeEqual(buf1, buf2);
}

// Best-effort Discord tier-role sync via the existing ws_svc_discord_sync RPC
// (same plan/apply pattern as netlify/functions/discord-sync-user.js). Never
// throws — membership activation must succeed even if Discord is unreachable.
async function syncDiscordForUser(userId) {
  if (!DISCORD_BOT_TOKEN || !SERVICE_KEY) return;
  try {
    const planRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ws_svc_discord_sync`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_id: userId }),
    });
    const plan = await planRes.json().catch(() => ({}));
    if (!plan.ok) return;
    const base = `https://discord.com/api/v10/guilds/${plan.guild_id}/members/${plan.discord_id}`;
    const H = { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' };
    if (plan.add_role_id) await fetch(`${base}/roles/${plan.add_role_id}`, { method: 'PUT', headers: H });
    for (const rid of plan.remove_role_ids || []) await fetch(`${base}/roles/${rid}`, { method: 'DELETE', headers: H });
  } catch (err) {
    console.error('[stripe-webhook] Discord sync failed:', err.message);
  }
}

async function resolveCustomerEmail(svc, sub) {
  if (sub.metadata?.email && sub.metadata.email.includes('@')) return sub.metadata.email;
  if (sub.customer_details?.email) return sub.customer_details.email;
  if (sub.customer && typeof sub.customer === 'string') {
    const { data } = await svc
      .from('checkout_sessions')
      .select('user_email')
      .eq('stripe_customer_id', sub.customer)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.user_email || null;
  }
  return null;
}

async function activateMembership(svc, { email, tier, billingCycle, stripeSessionId, stripeCustomerId, stripeSubscriptionId, stripePriceId, trialStartedAt = null, trialEndsAt = null, status = 'active' }) {
  const periodEnd = new Date(Date.now() + (billingCycle === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000);

  const { error } = await svc.from('user_memberships').upsert(
    {
      email,
      plan_slug: tier,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      stripe_price_id: stripePriceId,
      current_period_start: new Date().toISOString(),
      current_period_end: periodEnd.toISOString(),
      status,
      billing_cycle: billingCycle,
      trial_started_at: trialStartedAt,
      trial_ends_at: trialEndsAt,
    },
    { onConflict: 'email,plan_slug' }
  );
  if (error) { console.error('[stripe-webhook] activateMembership upsert failed:', error.message); return; }

  if (stripeSessionId) {
    await svc.from('checkout_sessions')
      .update({ activated_at: new Date().toISOString(), stripe_customer_id: stripeCustomerId || null })
      .eq('user_email', email).is('activated_at', null);
  }

  const { data: profile } = await svc.from('profiles').select('id').eq('email', email).maybeSingle();
  if (profile?.id) syncDiscordForUser(profile.id);

  console.log(`[stripe-webhook] Membership activated — ${email} on ${tier} (${billingCycle}, status=${status})`);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!isConfigured()) return json(500, { error: 'Supabase not configured' });

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
  const sigHeader = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];

  if (!verifySignature(rawBody, sigHeader)) {
    console.error('[stripe-webhook] Signature verification failed');
    return json(400, { error: 'Bad request' });
  }

  let stripeEvent;
  try { stripeEvent = JSON.parse(rawBody); } catch { return json(400, { error: 'Bad request' }); }

  const svc = getServiceClient();
  const obj = stripeEvent.data?.object || {};

  try {
    if (stripeEvent.type === 'checkout.session.completed') {
      const meta = obj.metadata || {};
      const stripeSessionId = obj.id;
      const amountCents = obj.amount_total || 0;

      if (meta.type === 'points') {
        const points = parseInt(meta.points || '0', 10);
        const customerEmail = obj.customer_details?.email || obj.customer_email || null;
        if (points && customerEmail) {
          const { data: profile } = await svc.from('profiles').select('id, referral_points').eq('email', customerEmail.toLowerCase()).maybeSingle();
          if (profile?.id) {
            await svc.from('point_transactions').insert({ user_id: profile.id, amount: points, type: 'purchase', description: `Purchased ${points.toLocaleString()} points` });
            await svc.from('profiles').update({ referral_points: (profile.referral_points || 0) + points }).eq('id', profile.id);
          }
        }
        return json(200, { received: true });
      }

      if (meta.type === 'donation') {
        await svc.from('donations').update({ status: 'completed' }).eq('stripe_session_id', stripeSessionId);
        return json(200, { received: true });
      }

      // Creator video sales. These must be handled BEFORE the membership branch
      // below, which otherwise claims every payment/subscription session and
      // would try to grant a WAGE tier for someone buying a creator's video.
      if (meta.kind === 'video_purchase') {
        await svc.from('video_purchases')
          .update({ status: 'paid' })
          .eq('stripe_session_id', stripeSessionId);
        return json(200, { received: true });
      }

      if (meta.kind === 'creator_subscription') {
        if (meta.creator_id && meta.subscriber_id) {
          await svc.from('creator_subscriptions')
            .update({
              status: 'active',
              stripe_subscription_id: obj.subscription || null,
            })
            .eq('creator_id', meta.creator_id)
            .eq('subscriber_id', meta.subscriber_id);
        }
        return json(200, { received: true });
      }

      // A la carte add-on. Also before the membership branch, and deliberately
      // grants no tier: buying an add-on is not buying a membership.
      if (meta.kind === 'addon_purchase') {
        await svc.from('addon_purchases')
          .update({
            status: 'paid',
            stripe_subscription_id: obj.subscription || null,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_session_id', stripeSessionId);
        return json(200, { received: true });
      }

      const isMembership = obj.mode === 'subscription' || obj.mode === 'payment' || !!obj.subscription || meta.type === 'subscription' || meta.type === 'membership';
      if (isMembership) {
        let email = meta.client_reference_id && meta.client_reference_id.includes('@') ? meta.client_reference_id : null;
        if (!email) {
          const customerEmail = obj.customer_details?.email || obj.customer_email || null;
          if (customerEmail) {
            const { data: cs } = await svc.from('checkout_sessions').select('user_email').eq('user_email', customerEmail.toLowerCase()).is('activated_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
            email = cs?.user_email || customerEmail;
          }
        }
        if (!email) { console.log(`[stripe-webhook] Membership completed but no email — session ${stripeSessionId}`); return json(200, { received: true }); }

        let tier = meta.tier || null;
        let billingCycle = meta.billing_cycle || null;
        if (!tier) {
          tier = inferTierFromAmount(amountCents);
          if (!tier) { console.log(`[stripe-webhook] Unknown payment amount ${amountCents} cents — session ${stripeSessionId}`); return json(200, { received: true }); }
          billingCycle = amountCents >= 10000 ? 'annual' : 'monthly';
        }

        await activateMembership(svc, {
          email, tier, billingCycle: billingCycle || 'monthly',
          stripeSessionId,
          stripeCustomerId: obj.customer || null,
          stripeSubscriptionId: obj.subscription || null,
          stripePriceId: obj.line_items?.data?.[0]?.price?.id || null,
          status: 'active',
        });
      }
      return json(200, { received: true });
    }

    if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(stripeEvent.type)) {
      const sub = obj;

      // A fan's subscription to a creator, not a WAGE membership. Claim it first
      // so the membership logic below never mistakes it for a tier purchase.
      const { data: creatorSub } = await svc
        .from('creator_subscriptions')
        .select('id')
        .eq('stripe_subscription_id', sub.id)
        .maybeSingle();
      if (creatorSub) {
        const ended = stripeEvent.type === 'customer.subscription.deleted'
          || ['canceled', 'unpaid', 'incomplete_expired'].includes(sub.status);
        await svc.from('creator_subscriptions').update({
          status: ended ? 'canceled' : 'active',
          current_period_end: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
        }).eq('id', creatorSub.id);
        return json(200, { received: true });
      }

      const priceId = sub.items?.data?.[0]?.price?.id;
      const billingCycle = inferBillingCycle(priceId || '');
      const planSlug = sub.metadata?.plan_slug || inferTierFromPriceId(priceId) || 'creator';
      const customerEmail = await resolveCustomerEmail(svc, sub);
      if (!customerEmail) { console.log(`[stripe-webhook] ${stripeEvent.type} — no email found for customer ${sub.customer}`); return json(200, { received: true }); }

      if (stripeEvent.type === 'customer.subscription.deleted') {
        await svc.from('user_memberships').update({ status: 'canceled', cancel_at_period_end: true }).eq('email', customerEmail).eq('plan_slug', planSlug);
        const { data: profile } = await svc.from('profiles').select('id').eq('email', customerEmail).maybeSingle();
        if (profile?.id) syncDiscordForUser(profile.id);
      } else {
        const trialStart = sub.trial_start ? new Date(sub.trial_start * 1000).toISOString() : null;
        const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
        const status = sub.status === 'trialing' ? 'trialing' : (sub.status === 'active' ? 'active' : sub.status);

        await svc.from('user_memberships').upsert({
          email: customerEmail, plan_slug: planSlug,
          stripe_customer_id: sub.customer, stripe_subscription_id: sub.id, stripe_price_id: priceId || null,
          current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          status, billing_cycle: billingCycle,
          trial_started_at: trialStart, trial_ends_at: trialEnd,
        }, { onConflict: 'email,plan_slug' });

        const { data: profile } = await svc.from('profiles').select('id').eq('email', customerEmail).maybeSingle();
        if (profile?.id) syncDiscordForUser(profile.id);
      }
      return json(200, { received: true });
    }

    if (stripeEvent.type === 'customer.subscription.trial_will_end') {
      // Email notification intentionally deferred — ZOHO SMTP not yet configured
      // on this site (see netlify/functions/_stripe-config.js note). Log only.
      console.log(`[stripe-webhook] trial_will_end for customer ${obj.customer}`);
      return json(200, { received: true });
    }

    return json(200, { received: true });
  } catch (err) {
    console.error('[stripe-webhook] Handler error:', err.message);
    return json(200, { received: true }); // ack to Stripe regardless — errors are logged, retries won't help on our bugs
  }
};
