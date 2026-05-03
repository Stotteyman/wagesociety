import { createFileRoute } from '@tanstack/react-router'
import Stripe from 'stripe'
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin'
import { getRequesterAccess } from '../../lib/orgAuth'

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

function getBaseUrl(request: Request) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') || 'http'
  if (!host) return 'http://localhost:3000'
  return `${proto}://${host}`
}

async function updateUserMembershipMetadata(
  email: string,
  updates: Partial<AuthUserMeta>,
) {
  const admin = getSupabaseAdminClient()
  const { data: users, error: usersError } = await admin
    .schema('auth')
    .from('users')
    .select('id, email, raw_user_meta_data')
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

export const Route = createFileRoute('/api/create-payment-intent')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Require an authenticated member — prevents anonymous abuse.
          const access = await getRequesterAccess(request)

          const body = (await request.json()) as {
            planSlug?: string
            email?: string
            name?: string
          }

          const { planSlug, email, name } = body

          if (!planSlug || !email) {
            return Response.json({ error: 'planSlug and email are required.' }, { status: 400 })
          }

          // Validate email format at the boundary
          const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
          if (!EMAIL_RE.test(email)) {
            return Response.json({ error: 'Invalid email address.' }, { status: 400 })
          }

          if (email.toLowerCase() !== access.requester.email) {
            return Response.json({ error: 'Email must match the authenticated user.' }, { status: 403 })
          }

          // Fetch plan details from DB
          const admin = getSupabaseAdminClient()
          const { data: _plan, error: planError } = await admin
            .from('org_shop_membership_plans')
            .select('id, slug, name, price_cents, display_price')
            .eq('slug', planSlug)
            .eq('is_active', true)
            .single()

          const plan = _plan as {
            id: string
            slug: string
            name: string
            price_cents: number
            display_price: string
          } | null

          if (planError || !plan) {
            return Response.json({ error: 'Plan not found.' }, { status: 404 })
          }

          const stripe = getStripe()

          const existingCustomers = await stripe.customers.list({ email, limit: 1 })
          let customer = existingCustomers.data[0]
          if (!customer) {
            customer = await stripe.customers.create({
              email,
              name: name || undefined,
              metadata: { membership_plan: plan.slug },
            })
          }

          const activeStatuses = ['active', 'trialing', 'past_due', 'incomplete'] as const
          const subs = await stripe.subscriptions.list({
            customer: customer.id,
            status: 'all',
            limit: 25,
          })
          const existingSubscription = subs.data.find((sub) =>
            activeStatuses.includes(sub.status as (typeof activeStatuses)[number]),
          )

          const baseUrl = getBaseUrl(request)

          // Free plan = cancel active paid subscription and set plan immediately.
          if (plan.price_cents === 0) {
            if (existingSubscription) {
              await stripe.subscriptions.cancel(existingSubscription.id)
            }

            await updateUserMembershipMetadata(email.toLowerCase(), {
              membership_plan: plan.slug,
              stripe_customer_id: customer.id,
              stripe_subscription_id: undefined,
            })

            await admin.rpc('ensure_org_member_role', {
              p_email: email.toLowerCase(),
            })

            return Response.json({
              free: true,
              planSlug: plan.slug,
              successUrl: `${baseUrl}/checkout?plan=${encodeURIComponent(plan.slug)}&status=success`,
            })
          }

          // Existing paid subscription: perform in-place plan change (upgrade/downgrade).
          if (existingSubscription) {
            const createdPrice = await stripe.prices.create({
              currency: 'usd',
              unit_amount: plan.price_cents,
              recurring: { interval: 'month' },
              product_data: {
                name: `${plan.name} Membership`,
                metadata: { planSlug: plan.slug },
              },
              metadata: { planSlug: plan.slug },
            })

            const currentItem = existingSubscription.items.data[0]
            if (!currentItem) {
              return Response.json({ error: 'Subscription item not found.' }, { status: 500 })
            }

            const updatedSubscription = await stripe.subscriptions.update(existingSubscription.id, {
              items: [
                {
                  id: currentItem.id,
                  price: createdPrice.id,
                },
              ],
              proration_behavior: 'always_invoice',
              metadata: {
                ...(existingSubscription.metadata || {}),
                membership_plan: plan.slug,
                customerEmail: email.toLowerCase(),
              },
            })

            await updateUserMembershipMetadata(email.toLowerCase(), {
              membership_plan: plan.slug,
              stripe_customer_id: customer.id,
              stripe_subscription_id: updatedSubscription.id,
            })

            await admin.rpc('ensure_org_member_role', {
              p_email: email.toLowerCase(),
            })

            return Response.json({
              updated: true,
              planSlug: plan.slug,
              subscriptionId: updatedSubscription.id,
              successUrl: `${baseUrl}/checkout?plan=${encodeURIComponent(plan.slug)}&status=success`,
            })
          }

          // No subscription yet: create Stripe-hosted subscription checkout.
          const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: customer.id,
            success_url: `${baseUrl}/checkout?plan=${encodeURIComponent(plan.slug)}&status=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/checkout?plan=${encodeURIComponent(plan.slug)}&status=cancelled`,
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: 'usd',
                  unit_amount: plan.price_cents,
                  recurring: { interval: 'month' },
                  product_data: {
                    name: `${plan.name} Membership`,
                    metadata: {
                      planSlug: plan.slug,
                    },
                  },
                },
              },
            ],
            subscription_data: {
              metadata: {
                membership_plan: plan.slug,
                customerEmail: email.toLowerCase(),
              },
            },
            metadata: {
              membership_plan: plan.slug,
              customerEmail: email.toLowerCase(),
            },
          })

          return Response.json({
            checkoutUrl: session.url,
            sessionId: session.id,
            customerId: customer.id,
            planName: plan.name,
            displayPrice: plan.display_price,
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unexpected server error.'
          return Response.json({ error: message }, { status: 500 })
        }
      },
    },
  },
})
