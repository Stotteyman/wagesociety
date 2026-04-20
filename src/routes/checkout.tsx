import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { loadStripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import { PaymentForm } from '../components/PaymentForm'
import { z } from 'zod'

// Singleton promise — created once, reused for all renders
let stripePromiseSingleton: ReturnType<typeof loadStripe> | null = null
function getStripePromise(): ReturnType<typeof loadStripe> | null {
  if (typeof window === 'undefined') return null
  if (!stripePromiseSingleton) {
    const key = import.meta.env.VITE_STRIPE_PUBLIC_KEY as string | undefined
    if (!key) {
      console.warn('VITE_STRIPE_PUBLIC_KEY is not set — Stripe will not load.')
      return null
    }
    stripePromiseSingleton = loadStripe(key)
  }
  return stripePromiseSingleton
}

const CheckoutSearchSchema = z.object({
  plan: z.string().optional(),
  redirect: z.string().optional(),
})

export const Route = createFileRoute('/checkout')({
  head: () => ({
    meta: [
      { title: 'Join the Organization — W.A.G.E. Society Checkout' },
      {
        name: 'description',
        content: 'Complete your W.A.G.E. Society membership and unlock creator resources, marketing systems, and entrepreneurship support.',
      },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  validateSearch: CheckoutSearchSchema,
  component: CheckoutPage,
})

interface PlanDetails {
  id: string
  slug: string
  name: string
  price: number
  displayPrice: string
  description: string
  features: string[]
}

type ShopApiPlan = {
  id: string
  slug: string
  name: string
  display_price: string
  price_cents: number
  description: string
  features: string[]
}

const fallbackPlans: PlanDetails[] = [
  {
    id: 'fallback-backstage',
    slug: 'backstage',
    name: 'Backstage',
    price: 0,
    displayPrice: '$0',
    description: 'For new builders exploring the organization.',
    features: ['Public knowledge feed', 'Monthly orientation workshop', 'Limited mastermind preview'],
  },
  {
    id: 'fallback-all-access',
    slug: 'all-access',
    name: 'All Access',
    price: 1900,
    displayPrice: '$19/mo',
    description: 'For active members building consistent growth momentum.',
    features: ['Full member authentication', 'Mastermind channels + resource library', 'Weekly live growth sessions'],
  },
  {
    id: 'fallback-creator-circle',
    slug: 'creator-circle',
    name: 'Creator Circle',
    price: 4900,
    displayPrice: '$49/mo',
    description: 'For founders and operators scaling online revenue.',
    features: ['Advanced creator and marketing systems', 'Priority partner and promotion access', 'Private strategy war room'],
  },
]

function CheckoutPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const [paymentComplete, setPaymentComplete] = useState(false)
  const [stripePromise] = useState<ReturnType<typeof loadStripe> | null>(() => getStripePromise())
  const [plans, setPlans] = useState<PlanDetails[]>(fallbackPlans)
  const [plansLoading, setPlansLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/shop')
        if (!response.ok) return

        const data = (await response.json()) as { membershipPlans?: ShopApiPlan[] }
        const normalized = (data.membershipPlans || []).map((plan) => ({
          id: plan.id,
          slug: plan.slug,
          name: plan.name,
          price: plan.price_cents,
          displayPrice: plan.display_price,
          description: plan.description,
          features: plan.features,
        }))

        if (normalized.length) {
          setPlans(normalized)
        }
      } finally {
        setPlansLoading(false)
      }
    })()
  }, [])

  const selectedPlan =
    plans.find((plan) => plan.slug === search.plan) ||
    plans.find((plan) => plan.slug === 'all-access') ||
    plans[0]

  if (!selectedPlan) {
    return (
      <div className="min-h-screen px-4 py-12 text-zinc-100">
        <div className="mx-auto max-w-2xl rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8 text-center">
          <h1 className="text-3xl font-black text-zinc-50">No Membership Plans Available</h1>
          <p className="mt-3 text-zinc-300">An admin needs to add at least one active plan in /admin/shop.</p>
        </div>
      </div>
    )
  }

  if (plansLoading) {
    return (
      <div className="min-h-screen px-4 py-12 text-zinc-100">
        <div className="mx-auto max-w-2xl rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8 text-center">
          <h1 className="text-3xl font-black text-zinc-50">Loading checkout plan...</h1>
        </div>
      </div>
    )
  }

  if (paymentComplete) {
    return (
      <div className="min-h-screen px-4 py-12 text-zinc-100">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8 text-center">
            <CheckCircle size={48} className="mx-auto mb-4 text-green-400" />
            <h1 className="text-3xl font-black text-zinc-50">Welcome to W.A.G.E. Society!</h1>
            <p className="mt-4 text-lg text-zinc-300">
              Your {selectedPlan.name} membership is now active. You have full access to the community.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => navigate({ to: '/dashboard' })}
                className="rounded-lg bg-orange-300 px-6 py-3 font-semibold text-zinc-950 transition hover:bg-orange-200"
              >
                Go to Dashboard
              </button>
              <button
                type="button"
                onClick={() => navigate({ to: '/' })}
                className="rounded-lg border border-zinc-100/30 px-6 py-3 font-semibold text-zinc-100 transition hover:border-orange-200/70"
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-12 text-zinc-100">
      <div className="mx-auto max-w-4xl">
        <button
          type="button"
          onClick={() => navigate({ to: '/dashboard' })}
          className="mb-8 inline-flex items-center gap-2 rounded-lg border border-zinc-300/35 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-100"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <div className="grid gap-8 lg:grid-cols-[1fr_1.25fr]">
          <section className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
            <h1 className="text-2xl font-bold text-zinc-50">Order Summary</h1>

            <div className="mt-6 space-y-4 border-b border-zinc-200/15 pb-6">
              <div className="flex justify-between">
                <span className="text-zinc-300">Plan</span>
                <span className="font-semibold text-zinc-50">{selectedPlan.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-300">Description</span>
                <span className="text-right text-sm text-zinc-300">{selectedPlan.description}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-300">Billing</span>
                <span className="font-semibold text-zinc-50">Monthly</span>
              </div>
            </div>

            <div className="mt-6 flex items-baseline justify-between">
              <span className="text-lg text-zinc-300">Total</span>
              <span className="text-4xl font-black text-orange-200">{selectedPlan.displayPrice}</span>
            </div>

            {selectedPlan.price === 0 && (
              <div className="mt-6 rounded-lg border border-green-400/40 bg-green-500/10 px-4 py-3 text-sm text-green-200">
                Free tier — activate instantly with no payment required.
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
            <h2 className="text-xl font-bold text-zinc-50">
              {selectedPlan.price === 0 ? 'Activate Account' : 'Payment Information'}
            </h2>

            {selectedPlan.price === 0 ? (
              <div className="mt-6 space-y-4">
                <p className="text-sm text-zinc-300">
                  Your Backstage membership is free and grants access to public community streams and highlights.
                </p>
                <button
                  type="button"
                  onClick={() => setPaymentComplete(true)}
                  className="w-full rounded-lg bg-green-600 px-6 py-3 font-semibold text-white transition hover:bg-green-500"
                >
                  Activate Free Membership
                </button>
              </div>
            ) : (
              <Elements
                stripe={stripePromise}
                options={{
                  appearance: {
                    theme: 'dark',
                    variables: {
                      colorPrimary: '#fb923c',
                      colorBackground: '#18181b',
                      colorText: '#f4f4f5',
                    },
                  },
                  locale: 'en',
                }}
              >
                <PaymentForm
                  plan={selectedPlan}
                  onSuccess={() => setPaymentComplete(true)}
                />
              </Elements>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
