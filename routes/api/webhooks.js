// routes/api/webhooks.js — Stripe webhook handler.
// Stripe events used to arrive here forwarded by the Polsia platform, which is
// retired — read the signing-secret note below before this route is served again.
// Handles: donations (checkout.session.completed) and
// subscription lifecycle including 7-day trial events.
// Billing cycle is inferred from price ID — annual links use unique price IDs.
//
// Membership activation priority:
//  1. checkout_sessions table (Stripe session_id → user_id → email)  ← PRIMARY
//  2. client_reference_id metadata (set by our checkout API)
//  3. customer_email on the Stripe session
//
// Tier inference from amount_total:
//   Creator: $29/mo=2900, annual $290=29000
//   Pro:     $79/mo=7900, annual $790=79000
//   ELITE:   $199/mo=19900
//   UNLIMITED: $499/mo=49900
//
// SECURITY NOTE: the signature is only checked when STRIPE_SIGNING_SECRET is
// set (see the handler at the bottom); without it every event posted to this
// path is trusted. That was defensible while Polsia's edge layer sat in front
// of the app and vouched for the traffic. It no longer does, and this handler
// activates paid memberships — so set STRIPE_SIGNING_SECRET before this route
// is exposed again.
const express = require('express');
const router = express.Router();
const { completeDonationByWebhook } = require('../../db/donations');
const { upsertMembership } = require('../../db/memberships');
const { getUserByEmail } = require('../../db/users');
const { getByEmail, markActivated } = require('../../db/checkout_sessions');
const { syncAllGuildsForUser } = require('../../lib/discord-sync');

function inferBillingCycle(stripePriceId) {
  if (!stripePriceId) return 'monthly';
  const id = stripePriceId.toLowerCase();
  if (id.includes('annual') || id.includes('yearly') || id.includes('_yr')) return 'annual';
  return 'monthly';
}

function inferTier(amountCents) {
  if (amountCents === 2900 || amountCents === 29000) return 'creator';
  if (amountCents === 7900 || amountCents === 79000) return 'pro';
  if (amountCents === 19900) return 'elite';
  if (amountCents === 49900) return 'unlimited';
  return null;
}

function inferTierFromPriceId(priceId) {
  if (!priceId) return null;
  const id = priceId.toLowerCase();
  if (id.includes('creator')) return 'creator';
  if (id.includes('pro') && !id.includes('elite')) return 'pro';
  if (id.includes('elite')) return 'elite';
  if (id.includes('unlimited')) return 'unlimited';
  return null;
}

async function resolveCustomerEmail(sub) {
  if (sub.metadata?.email && sub.metadata.email.includes('@')) return sub.metadata.email;
  if (sub.customer_details?.email) return sub.customer_details.email;
  if (sub.customer && typeof sub.customer === 'string') {
    const { pool } = require('../../db/index');
    const r = await pool.query(
      `SELECT user_email FROM checkout_sessions WHERE stripe_customer_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [sub.customer]
    ).catch(() => ({ rows: [] }));
    return r.rows[0]?.user_email || null;
  }
  return null;
}

async function activateMembership({ email, tier, billingCycle, stripeSessionId, stripeCustomerId, stripeSubscriptionId, stripePriceId, trialStartedAt = null, trialEndsAt = null, status = 'active' }) {
  const periodEnd = new Date(Date.now() + (billingCycle === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000);

  await upsertMembership({
    email,
    planSlug: tier,
    stripeCustomerId,
    stripeSubscriptionId,
    stripePriceId,
    periodStart: new Date(),
    periodEnd,
    status,
    billingCycle,
    trialStartedAt,
    trialEndsAt,
  });

  if (stripeSessionId) await markActivated(stripeSessionId).catch(() => {});

  const user = await getUserByEmail(email).catch(() => null);
  if (user?.id) {
    syncAllGuildsForUser(user.id).catch(err => console.log(`[webhook] Discord role sync failed for ${email}: ${err.message}`));
  }

  console.log(`[webhook] Membership activated — ${email} on ${tier} (${billingCycle}, status=${status})`);
}

async function sendTrialEndingEmail(email, tierName) {
  if (!process.env.ZOHO_SMTP_USER) {
    console.log(`[webhook/trial] No ZOHO SMTP — skipping trial ending email to ${email}`);
    return;
  }
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({
    host: process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com',
    port: Number(process.env.ZOHO_SMTP_PORT) || 465,
    secure: Number(process.env.ZOHO_SMTP_PORT || 465) === 465,
    auth: { user: process.env.ZOHO_SMTP_USER, pass: process.env.ZOHO_SMTP_PASS },
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
  });
  const appUrl = process.env.APP_URL || 'https://wagesociety.com';
  try {
    await transport.sendMail({
      from: '"W.A.G.E. Society" <hello@wagesociety.com>',
      to: email,
      subject: `Your ${tierName} trial ends in 3 days`,
      text: `Your ${tierName} trial ends in 3 days.\n\nLove it? Do nothing — your subscription starts automatically.\nNot ready? Cancel from your account settings: ${appUrl}/settings\n\nNo charge until Day 8. Cancel anytime.`,
      html: `<p>Your <strong>${tierName}</strong> trial ends in 3 days.</p>
<p><strong>Love it?</strong> Do nothing — your subscription starts automatically on Day 8.</p>
<p><strong>Not ready?</strong> <a href="${appUrl}/settings">Cancel from your account settings</a> — $0 charged.</p>
<p style="font-size:0.85rem;color:#888;">Cancel anytime before Day 8 at ${appUrl}/settings</p>`,
    });
    console.log(`[webhook/trial] Trial ending email sent to ${email} (${tierName})`);
  } catch (err) {
    console.error(`[webhook/trial] Failed to send trial ending email to ${email}: ${err.message}`);
  }
}

async function sendActivatedEmail(email, tierName) {
  if (!process.env.ZOHO_SMTP_USER) return;
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({
    host: process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com',
    port: Number(process.env.ZOHO_SMTP_PORT) || 465,
    secure: Number(process.env.ZOHO_SMTP_PORT || 465) === 465,
    auth: { user: process.env.ZOHO_SMTP_USER, pass: process.env.ZOHO_SMTP_PASS },
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
  });
  const appUrl = process.env.APP_URL || 'https://wagesociety.com';
  try {
    await transport.sendMail({
      from: '"W.A.G.E. Society" <hello@wagesociety.com>',
      to: email,
      subject: `Your ${tierName} membership is now active`,
      text: `Welcome to ${tierName}! Your subscription is now active. Log in at ${appUrl}/dashboard`,
      html: `<p>Welcome to <strong>${tierName}</strong>! 🎉</p>
<p>Your subscription is now active. Enjoy full access to all ${tierName} features.</p>
<p><a href="${appUrl}/dashboard">Go to your dashboard →</a></p>`,
    });
  } catch (err) {
    console.error(`[webhook] Failed to send activation email to ${email}: ${err.message}`);
  }
}

router.post('/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try {
    if (process.env.STRIPE_SIGNING_SECRET && req.headers['stripe-signature']) {
      const crypto = require('crypto');
      const sigHeader = req.headers['stripe-signature'];
      const parts = sigHeader.split(',');
      const tp = parts.find(p => p.startsWith('t='));
      const sp = parts.find(p => p.startsWith('v1='));
      if (!tp || !sp) throw new Error('Malformed Stripe signature');
      const timestamp = parseInt(tp.slice(2), 10);
      if (Math.abs(Date.now() / 1000 - timestamp) > 300) throw new Error('Webhook timestamp too old');
      const payload = `${timestamp}.${req.body.toString()}`;
      const expected = crypto.createHmac('sha256', process.env.STRIPE_SIGNING_SECRET).update(payload).digest('hex');
      const buf1 = Buffer.from(expected);
      const buf2 = Buffer.from(sp.slice(3));
      if (buf1.length !== buf2.length || !crypto.timingSafeEqual(buf1, buf2)) throw new Error('Stripe signature mismatch');
      event = JSON.parse(req.body.toString());
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('[webhook] Parse/signature error:', err.message);
    return res.status(400).json({ error: 'Bad request' });
  }

  const session = event.data?.object || {};

  // ── checkout.session.completed ────────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const meta = session.metadata || {};
    const stripeSessionId = session.id;
    const amountCents = session.amount_total || 0;

    if (meta.type === 'points') {
      const points = parseInt(meta.points || '0', 10);
      if (!points) return res.json({ received: true });
      const customerEmail = session.customer_details?.email || session.customer_email || null;
      if (!customerEmail) return res.json({ received: true });
      (async () => {
        const { upsertPointsSession, markActivated } = require('../../db/checkout_sessions');
        const { getUserByEmail } = require('../../db/users');
        const { pool } = require('../../db/index');
        await upsertPointsSession(stripeSessionId, customerEmail, meta).catch(() => {});
        const user = await getUserByEmail(customerEmail).catch(() => null);
        if (!user?.id) return;
        await pool.query(`INSERT INTO point_transactions (user_id, amount, type, description) VALUES ($1, $2, 'purchase', $3)`, [user.id, points, `Purchased ${points.toLocaleString()} points`]).catch(() => {});
        await pool.query(`UPDATE auth_users SET referral_points = referral_points + $1 WHERE id = $2`, [points, user.id]).catch(() => {});
        await markActivated(stripeSessionId).catch(() => {});
        console.log(`[webhook] Points purchase — ${points.toLocaleString()} pts to ${customerEmail}`);
      })().catch(err => console.error('[webhook] Points purchase failed:', err.message));
      return res.json({ received: true });
    }

    if (meta.type === 'donation') {
      completeDonationByWebhook(stripeSessionId, amountCents).catch(err => console.error('[webhook] Donation DB update failed:', err.message));
      return res.json({ received: true });
    }

    const isMembership = session.mode === 'subscription'
      || session.mode === 'payment'
      || !!session.subscription
      || meta.type === 'subscription'
      || meta.type === 'membership';

    if (isMembership) {
      const emailPromise = (async () => {
        if (meta.client_reference_id && meta.client_reference_id.includes('@')) return meta.client_reference_id;
        const customerEmail = session.customer_details?.email || session.customer_email || null;
        if (customerEmail) {
          const cs = await getByEmail(customerEmail).catch(() => null);
          if (cs?.user_email) return cs.user_email;
        }
        return null;
      })();

      emailPromise.then(async (email) => {
        if (!email) { console.log(`[webhook] Membership completed but no email — session ${stripeSessionId}`); return; }

        const { getByEmail } = require('../../db/checkout_sessions');
        const csRecord = await getByEmail(email).catch(() => null);
        if (csRecord?.plan_slug === 'points') {
          const points = parseInt(JSON.parse(csRecord.metadata || '{}').points || '0', 10);
          if (points > 0) {
            const { getUserByEmail } = require('../../db/users');
            const { pool } = require('../../db/index');
            const user = await getUserByEmail(email).catch(() => null);
            if (user?.id) {
              await pool.query(`INSERT INTO point_transactions (user_id, amount, type, description) VALUES ($1, $2, 'purchase', $3)`, [user.id, points, `Purchased ${points.toLocaleString()} points`]).catch(() => {});
              await pool.query(`UPDATE auth_users SET referral_points = referral_points + $1 WHERE id = $2`, [points, user.id]).catch(() => {});
            }
          }
          return;
        }

        let tier = meta.tier || null;
        let billingCycle = meta.billing_cycle || null;
        if (!tier) {
          tier = inferTier(amountCents);
          if (!tier) {
            if (session.mode === 'payment') { console.log(`[webhook] Unknown payment amount ${amountCents} cents — session ${stripeSessionId}`); return; }
          } else {
            billingCycle = amountCents >= 10000 ? 'annual' : 'monthly';
          }
        }

        await activateMembership({
          email, tier,
          billingCycle: billingCycle || 'monthly',
          stripeSessionId,
          stripeCustomerId: session.customer || null,
          stripeSubscriptionId: session.subscription || null,
          stripePriceId: session.subscription_price_id || session.line_items?.data?.[0]?.price?.id || null,
          status: 'active',
        }).catch(err => console.error('[webhook] activateMembership failed:', err.message));
      }).catch(err => console.error('[webhook] Membership email resolution failed:', err.message));

      return res.json({ received: true });
    }

    return res.json({ received: true });
  }

  // ── customer.subscription.trial_will_end — fires 3 days before trial ends ──
  if (event.type === 'customer.subscription.trial_will_end') {
    const sub = event.data.object;
    resolveCustomerEmail(sub).then(async (email) => {
      if (!email) return;
      const planSlug = sub.metadata?.plan_slug || inferTierFromPriceId(sub.items?.data?.[0]?.price?.id) || 'creator';
      const tierName = planSlug.charAt(0).toUpperCase() + planSlug.slice(1);
      await sendTrialEndingEmail(email, tierName).catch(err => console.error('[webhook/trial_will_end] email error:', err.message));
      console.log(`[webhook] Trial ending soon for ${email} on ${planSlug}`);
    }).catch(err => console.error('[webhook] trial_will_end email resolution error:', err.message));
    return res.json({ received: true });
  }

  // ── Subscription lifecycle events ───────────────────────────────────────────
  if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
    const sub = event.data.object;
    const priceId = sub.items?.data?.[0]?.price?.id;
    const billingCycle = inferBillingCycle(priceId || '');
    const planSlug = sub.metadata?.plan_slug || inferTierFromPriceId(priceId) || 'creator';

    resolveCustomerEmail(sub).then(async (customerEmail) => {
      if (!customerEmail) {
        console.log(`[webhook] ${event.type} — no email found for customer ${sub.customer}`);
        return;
      }

      if (event.type === 'customer.subscription.deleted') {
        await require('../../db/memberships').cancelMembership(customerEmail, planSlug).catch(err => console.error('[webhook] Cancel membership failed:', err.message));
        const user = await getUserByEmail(customerEmail).catch(() => null);
        if (user?.id) {
          require('../../lib/discord-sync').removeDiscordRoles(user.id).catch(err => console.log(`[webhook] Discord role removal failed for ${customerEmail}: ${err.message}`));
        }
        console.log(`[webhook] ${event.type} — ${customerEmail} canceled ${planSlug}`);
      } else {
        const trialStart = sub.trial_start ? new Date(sub.trial_start * 1000) : null;
        const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
        const isTrialing = sub.status === 'trialing';
        const isActive = sub.status === 'active';
        const updateStatus = isTrialing ? 'trialing' : (isActive ? 'active' : sub.status);

        await upsertMembership({
          email: customerEmail,
          planSlug,
          stripeCustomerId: sub.customer,
          stripeSubscriptionId: sub.id,
          stripePriceId: priceId || null,
          periodStart: new Date(sub.current_period_start * 1000),
          periodEnd: new Date(sub.current_period_end * 1000),
          status: updateStatus,
          billingCycle,
          trialStartedAt: trialStart,
          trialEndsAt: trialEnd,
        }).then(async () => {
          const user = await getUserByEmail(customerEmail).catch(() => null);
          if (user?.id) {
            syncAllGuildsForUser(user.id).catch(err => console.log(`[webhook] Discord sync failed for ${customerEmail}: ${err.message}`));
          }
          if (isActive) {
            const tierName = planSlug.charAt(0).toUpperCase() + planSlug.slice(1);
            await sendActivatedEmail(customerEmail, tierName).catch(() => {});
            console.log(`[webhook] Trial ended, subscription active — ${customerEmail} on ${planSlug}`);
          } else {
            console.log(`[webhook] ${event.type} — ${customerEmail} on ${planSlug} (${billingCycle}, status=${updateStatus})`);
          }
        }).catch(err => console.error('[webhook] Membership upsert failed:', err.message));
      }
    }).catch(err => console.error(`[webhook] ${event.type} email resolution error:`, err.message));

    return res.json({ received: true });
  }

  res.json({ received: true });
});

module.exports = router;