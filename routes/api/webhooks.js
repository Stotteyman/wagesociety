// routes/api/webhooks.js — Polsia Stripe webhook handler.
// Receives Stripe events via Polsia's webhook forwarding.
// Handles: donations (checkout.session.completed) and
// subscription lifecycle (customer.subscription.created, updated, deleted).
// Billing cycle is inferred from price ID — annual links use unique price IDs.
const express = require('express');
const router = express.Router();
const { completeDonationByWebhook } = require('../../db/donations');
const { upsertMembership } = require('../../db/memberships');

// Annual price IDs (from Polsia Stripe MCP, 2026-05-25)
// These are checked against stripe_price_id to determine billing_cycle.
const ANNUAL_PRICE_IDS = new Set([
  'polsia_annual_creator_290',  // placeholder — Stripe assigns real IDs at payment time
  'polsia_annual_pro_790',
]);

function inferBillingCycle(stripePriceId) {
  // If the price ID contains annual indicators, treat as annual.
  // This is a best-effort inference; the DB default is 'monthly'.
  if (!stripePriceId) return 'monthly';
  const id = stripePriceId.toLowerCase();
  if (id.includes('annual') || id.includes('yearly') || id.includes('_yr')) return 'annual';
  return 'monthly';
}

router.post('/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try {
    if (process.env.STRIPE_SIGNING_SECRET) {
      event = verifyStripeSignature(req.body, req.headers['stripe-signature'], process.env.STRIPE_SIGNING_SECRET);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('[webhook/stripe] Failed to parse event:', err.message);
    return res.status(400).json({ error: 'Bad request' });
  }

  // Donations: checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.metadata?.type === 'donation') {
      const stripeSessionId = session.id;
      const donorName = session.metadata.donor_name || '';
      const amountCents = session.amount_total || 0;
      completeDonationByWebhook(stripeSessionId, amountCents).then(result => {
        if (result) {
          console.log(`[webhook] Donation completed — DB id ${result.id}, $${(amountCents / 100).toFixed(2)} from ${donorName}`);
        } else {
          console.log(`[webhook] No pending donation for session ${stripeSessionId}`);
        }
      }).catch(err => console.error('[webhook] Donation DB update failed:', err.message));
    }
    return res.json({ received: true });
  }

  // Subscription lifecycle events (for Polsia-hosted subscription links)
  if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
    const sub = event.data.object;
    const customerEmail = sub.metadata?.email ||
      sub.customer_details?.email ||
      (sub.customer ? null : null); // fallback: look up via customer ID if needed

    if (customerEmail && sub.items?.data?.[0]?.price?.id) {
      const priceId = sub.items.data[0].price.id;
      const billingCycle = inferBillingCycle(priceId);
      const planSlug = sub.metadata?.plan_slug || 'creator'; // default to creator if not set

      if (event.type === 'customer.subscription.deleted') {
        // Cancel the membership
        const { cancelMembership } = require('../../db/memberships');
        cancelMembership(customerEmail, planSlug).catch(err => {
          console.error('[webhook] Cancel membership failed:', err.message);
        });
      } else {
        // Upsert membership with inferred billing cycle
        upsertMembership({
          email: customerEmail,
          planSlug,
          stripeCustomerId: sub.customer,
          stripeSubscriptionId: sub.id,
          stripePriceId: priceId,
          periodStart: new Date(sub.current_period_start * 1000),
          periodEnd: new Date(sub.current_period_end * 1000),
          status: sub.status === 'active' || sub.status === 'trialing' ? 'active' : sub.status,
          billingCycle,
        }).then(() => {
          console.log(`[webhook] ${event.type} — ${customerEmail} on ${planSlug} (${billingCycle}), period ends ${new Date(sub.current_period_end * 1000).toISOString()}`);
        }).catch(err => {
          console.error('[webhook] Membership upsert failed:', err.message);
        });
      }
    }
    return res.json({ received: true });
  }

  res.json({ received: true });
});

function verifyStripeSignature(body, sigHeader, secret) {
  const crypto = require('crypto');
  const parts = (sigHeader || '').split(',');
  const timestampPart = parts.find(p => p.startsWith('t='));
  const sigPart = parts.find(p => p.startsWith('v1='));
  if (!timestampPart || !sigPart) throw new Error('Malformed Stripe signature header');
  const timestamp = timestampPart.slice(2);
  const expectedSig = sigPart.slice(3);
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) {
    throw new Error('Timestamp too old (>5 min)');
  }
  const payload = `${timestamp}.${body.toString()}`;
  const computed = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const buf1 = Buffer.from(computed);
  const buf2 = Buffer.from(expectedSig);
  if (buf1.length !== buf2.length || !crypto.timingSafeEqual(buf1, buf2)) {
    throw new Error('Signature mismatch');
  }
  return JSON.parse(body.toString());
}

module.exports = router;