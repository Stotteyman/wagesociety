import { createFileRoute } from '@tanstack/react-router'
import Stripe from 'stripe'
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin'

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set.')
  return new Stripe(key, { apiVersion: '2026-03-25.dahlia' })
}

/**
 * POST /api/stripe-webhook
 *
 * Stripe sends signed webhook events here.
 * Set STRIPE_WEBHOOK_SECRET in your env to verify signatures.
 *
 * Register this URL in your Stripe dashboard:
 *   https://dashboard.stripe.com/webhooks → Add endpoint → https://yourdomain.com/api/stripe-webhook
 *
 * Events handled:
 *   - payment_intent.succeeded  → ensure org role is set to at least "user"
 *   - customer.subscription.deleted → downgrade role if needed (future)
 */
export const Route = createFileRoute('/api/stripe-webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const stripe = getStripe()
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

        let event: Stripe.Event

        try {
          const payload = await request.text()
          const sig = request.headers.get('stripe-signature') || ''

          if (!webhookSecret) {
            return Response.json({ error: 'Webhook secret not configured.' }, { status: 500 })
          }

          if (!sig) {
            return Response.json({ error: 'Missing stripe-signature header.' }, { status: 400 })
          }

          event = await stripe.webhooks.constructEventAsync(payload, sig, webhookSecret)
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Invalid webhook payload.'
          return Response.json({ error: msg }, { status: 400 })
        }

        try {
          if (event.type === 'payment_intent.succeeded') {
            const intent = event.data.object as Stripe.PaymentIntent
            const { customerEmail, planSlug } = intent.metadata

            if (customerEmail) {
              const admin = getSupabaseAdminClient()

              // Ensure the member exists with at least the "user" role
              // ensure_org_member_role provisions the role if not present
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (admin.rpc as any)('ensure_org_member_role', {
                p_email: customerEmail,
              })

              // Log the fulfilled purchase
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (admin.from('org_shop_orders') as any).upsert(
                {
                  stripe_payment_intent_id: intent.id,
                  customer_email: customerEmail,
                  plan_slug: planSlug || null,
                  amount_cents: intent.amount,
                  currency: intent.currency,
                  status: 'paid',
                  paid_at: new Date().toISOString(),
                },
                { onConflict: 'stripe_payment_intent_id', ignoreDuplicates: true }
              )
            }
          }
        } catch {
          // Log and continue — Stripe retries failed webhooks
          console.error('[stripe-webhook] fulfillment error', event.id)
        }

        return Response.json({ received: true })
      },
    },
  },
})
