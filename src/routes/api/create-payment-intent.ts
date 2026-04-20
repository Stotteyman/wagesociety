import { createFileRoute } from '@tanstack/react-router'
import Stripe from 'stripe'
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin'
import { resolveRequester } from '../../lib/orgAuth'

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set.')
  return new Stripe(key, { apiVersion: '2025-03-31.basil' })
}

export const Route = createFileRoute('/api/create-payment-intent')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
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

          // Fetch plan price from DB
          const admin = getSupabaseAdminClient()
          const { data: plan, error: planError } = await admin
            .from('org_shop_membership_plans')
            .select('id, slug, name, price_cents, display_price')
            .eq('slug', planSlug)
            .eq('is_active', true)
            .single()

          if (planError || !plan) {
            return Response.json({ error: 'Plan not found.' }, { status: 404 })
          }

          // Free plans don't need a payment intent — return a success token
          if (plan.price_cents === 0) {
            return Response.json({ free: true, planSlug: plan.slug })
          }

          const stripe = getStripe()

          // Look up or create Stripe customer
          const existingCustomers = await stripe.customers.list({ email, limit: 1 })
          let customer = existingCustomers.data[0]

          if (!customer) {
            customer = await stripe.customers.create({
              email,
              name: name || undefined,
              metadata: { planSlug },
            })
          }

          const paymentIntent = await stripe.paymentIntents.create({
            amount: plan.price_cents,
            currency: 'usd',
            customer: customer.id,
            receipt_email: email,
            metadata: {
              planSlug,
              planName: plan.name,
              customerEmail: email,
            },
            automatic_payment_methods: { enabled: true },
          })

          return Response.json({
            clientSecret: paymentIntent.client_secret,
            planName: plan.name,
            displayPrice: plan.display_price,
            customerId: customer.id,
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unexpected server error.'
          return Response.json({ error: message }, { status: 500 })
        }
      },
    },
  },
})
