import { createFileRoute } from '@tanstack/react-router'
import Stripe from 'stripe'
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin'

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set.')
  return new Stripe(key, { apiVersion: '2026-03-25.dahlia' })
}

type AuthUserMeta = {
  membership_plan?: string
  stripe_customer_id?: string
  stripe_subscription_id?: string
}

function extractPlanSlugFromSubscription(subscription: Stripe.Subscription) {
  const fromMeta = subscription.metadata?.membership_plan?.trim()
  if (fromMeta) return fromMeta

  const firstItem = subscription.items.data[0]
  const fromPriceMeta = firstItem?.price?.metadata?.planSlug?.trim()
  if (fromPriceMeta) return fromPriceMeta

  const fromProductMeta = firstItem?.price?.product
  if (fromProductMeta && typeof fromProductMeta !== 'string') {
    const slug = fromProductMeta.metadata?.planSlug?.trim()
    if (slug) return slug
  }

  return null
}

async function updateMembershipMetadataByEmail(email: string, updates: Partial<AuthUserMeta>) {
  const admin = getSupabaseAdminClient()
  const { data: users, error: usersError } = await admin
    .schema('auth')
    .from('users')
    .select('id, raw_user_meta_data')
    .ilike('email', email)
    .limit(1)

  if (usersError) throw new Error(usersError.message)

  const user = Array.isArray(users) ? users[0] : null
  if (!user?.id) return

  const currentMeta = ((user.raw_user_meta_data as AuthUserMeta | null | undefined) ?? {})
  const nextMeta: AuthUserMeta = {
    ...currentMeta,
    ...updates,
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: nextMeta,
  })

  if (updateError) throw new Error(updateError.message)
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
 *   - checkout.session.completed  → ensure org role is set to at least "user"
 *   - customer.subscription.updated → sync membership plan metadata
 *   - customer.subscription.deleted → downgrade to free plan
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
          if (event.type === 'checkout.session.completed') {
            const session = event.data.object as Stripe.Checkout.Session
            const customerEmail =
              session.metadata?.customerEmail || session.customer_details?.email || undefined
            const planSlug = session.metadata?.membership_plan || undefined

            if (customerEmail) {
              const normalizedEmail = customerEmail.toLowerCase()
              const admin = getSupabaseAdminClient()

              await admin.rpc('ensure_org_member_role', {
                p_email: normalizedEmail,
              })

              await updateMembershipMetadataByEmail(normalizedEmail, {
                membership_plan: planSlug || 'free',
                stripe_customer_id: typeof session.customer === 'string' ? session.customer : undefined,
                stripe_subscription_id: typeof session.subscription === 'string' ? session.subscription : undefined,
              })
            }
          }

          if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
            const subscription = event.data.object as Stripe.Subscription
            const customerId = typeof subscription.customer === 'string' ? subscription.customer : ''

            if (customerId) {
              const customer = await stripe.customers.retrieve(customerId)
              const customerEmail =
                typeof customer !== 'string' && !customer.deleted
                  ? customer.email?.toLowerCase()
                  : undefined

              if (customerEmail) {
                const planSlug = extractPlanSlugFromSubscription(subscription) || 'free'
                const admin = getSupabaseAdminClient()
                await admin.rpc('ensure_org_member_role', {
                  p_email: customerEmail,
                })

                await updateMembershipMetadataByEmail(customerEmail, {
                  membership_plan: planSlug,
                  stripe_customer_id: customerId,
                  stripe_subscription_id: subscription.id,
                })
              }
            }
          }

          if (event.type === 'customer.subscription.deleted') {
            const subscription = event.data.object as Stripe.Subscription
            const customerId = typeof subscription.customer === 'string' ? subscription.customer : ''
            if (customerId) {
              const customer = await stripe.customers.retrieve(customerId)
              const customerEmail =
                typeof customer !== 'string' && !customer.deleted
                  ? customer.email?.toLowerCase()
                  : undefined

              if (customerEmail) {
                await updateMembershipMetadataByEmail(customerEmail, {
                  membership_plan: 'free',
                  stripe_customer_id: customerId,
                  stripe_subscription_id: undefined,
                })
              }
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
