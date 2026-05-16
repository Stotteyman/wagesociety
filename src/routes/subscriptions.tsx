import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ArrowLeft, CreditCard } from 'lucide-react'
import { authedFetch, getSupabaseBrowserClient } from '../lib/supabaseBrowser'
import { requireAuthenticatedRoute } from '../lib/routeAuth'

type AppUser = {
  email?: string | null
  user_metadata?: {
    username?: string
    preferred_username?: string
    membership_plan?: string
  }
}

type MembershipPlan = {
  id: string
  slug: string
  name: string
  display_price: string
  description: string
  features: string[]
}

const fallbackMembershipPlans: MembershipPlan[] = [
  {
    id: 'fallback-free',
    slug: 'free',
    name: 'FREE',
    display_price: '$0',
    description: 'Very limited access for basic account setup and browsing.',
    features: ['Log in and account access', 'Connect social/OAuth accounts', 'Browse public sections'],
  },
]

function getMemberDisplayName(member: AppUser | null) {
  const username = String(member?.user_metadata?.username || '').trim()
  const preferred = String(member?.user_metadata?.preferred_username || '').trim()
  const fromEmail = String(member?.email || '').split('@')[0].trim()
  return username || preferred || fromEmail || 'Member'
}

export const Route = createFileRoute('/subscriptions')({
  beforeLoad: async () => {
    await requireAuthenticatedRoute('/login')
  },
  head: () => ({
    meta: [
      { title: 'Subscriptions — W.A.G.E. Society' },
      {
        name: 'description',
        content: 'Manage your membership subscription, billing upgrades, and downgrades.',
      },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: SubscriptionsPage,
})

function SubscriptionsPage() {
  const [member, setMember] = useState<AppUser | null>(null)
  const [plans, setPlans] = useState<MembershipPlan[]>(fallbackMembershipPlans)
  const [plansLoading, setPlansLoading] = useState(true)
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null)
  const [subscriptionError, setSubscriptionError] = useState('')
  const [loading, setLoading] = useState(true)

  const memberPlanSlug = String(member?.user_metadata?.membership_plan || 'free').trim().toLowerCase()
  const currentPlan =
    plans.find((plan) => plan.slug.toLowerCase() === memberPlanSlug) ||
    plans.find((plan) => plan.slug === 'free') ||
    fallbackMembershipPlans[0]

  useEffect(() => {
    let mounted = true

    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data } = await supabase.auth.getSession()
        if (!mounted) return
        setMember((data.session?.user as AppUser | undefined) ?? null)
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/shop')
        if (!response.ok) return
        const data = (await response.json()) as { membershipPlans?: MembershipPlan[] }
        if (data.membershipPlans?.length) {
          setPlans(data.membershipPlans)
        }
      } catch {
        // Keep fallback plans.
      } finally {
        setPlansLoading(false)
      }
    })()
  }, [])

  const updateMembership = async (plan: MembershipPlan) => {
    const email = String(member?.email || '').trim().toLowerCase()
    if (!email) {
      setSubscriptionError('Missing account email. Please refresh and try again.')
      return
    }

    try {
      setUpgradingPlan(plan.slug)
      setSubscriptionError('')

      const response = await authedFetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planSlug: plan.slug,
          email,
          name: getMemberDisplayName(member),
        }),
      })

      const data = (await response.json()) as {
        checkoutUrl?: string
        successUrl?: string
        updated?: boolean
        free?: boolean
        error?: string
      }

      if (!response.ok || data.error) {
        setSubscriptionError(data.error || 'Could not update your subscription right now.')
        return
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
        return
      }

      if (data.successUrl) {
        window.location.href = data.successUrl
        return
      }

      if (data.updated || data.free) {
        window.location.reload()
      }
    } catch {
      setSubscriptionError('Could not update your subscription right now.')
    } finally {
      setUpgradingPlan(null)
    }
  }

  if (loading || !member) {
    return (
      <div className="min-h-screen px-4 py-24 text-zinc-100">
        <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8 text-center">
          <p className="text-sm uppercase tracking-[0.2em] text-zinc-400">Loading subscriptions</p>
          <h1 className="mt-4 text-3xl font-bold text-zinc-50">Preparing your membership options...</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-12 text-zinc-100">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Membership & Billing</p>
              <h1 className="mt-2 text-3xl font-black text-zinc-50 md:text-4xl">Subscription Management</h1>
              <p className="mt-3 max-w-2xl text-zinc-300">
                Choose, upgrade, or downgrade your membership plan. Stripe checkout and recurring billing are managed here.
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                to="/settings"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100"
              >
                <ArrowLeft size={16} />
                Settings
              </Link>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100"
              >
                <ArrowLeft size={16} />
                Dashboard
              </Link>
            </div>
          </div>
        </header>

        <article className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
          <div className="mb-4 rounded-xl border border-orange-200/40 bg-orange-200/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Current subscription</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-base font-black text-zinc-50">{currentPlan.name}</p>
                <p className="text-xs text-zinc-400">{currentPlan.description}</p>
              </div>
              <p className="text-sm font-black text-orange-200">{currentPlan.display_price}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-md border border-zinc-200/20 bg-zinc-950/70 p-2 text-orange-200">
              <CreditCard size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-50">Available Plans</h2>
              <p className="text-xs text-zinc-400">Manage your membership plan</p>
            </div>
          </div>

          {plansLoading ? (
            <p className="mt-4 text-sm text-zinc-400">Loading plans...</p>
          ) : (
            <div className="mt-4 space-y-2">
              {plans.map((plan) => {
                const isCurrent =
                  currentPlan.slug.toLowerCase() === plan.slug.toLowerCase()

                return (
                  <div
                    key={plan.slug}
                    className={`rounded-xl border p-4 transition ${
                      isCurrent
                        ? 'border-orange-200/60 bg-orange-200/10'
                        : 'border-zinc-200/15 bg-zinc-950/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-zinc-50">{plan.name}</p>
                          {isCurrent ? (
                            <span className="rounded-full bg-orange-300 px-2 py-0.5 text-xs font-bold text-zinc-950">
                              Current
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm font-black text-orange-200">{plan.display_price}</p>
                        <p className="mt-0.5 text-xs text-zinc-400">{plan.description}</p>
                      </div>
                      {!isCurrent ? (
                        <button
                          type="button"
                          onClick={() => { void updateMembership(plan) }}
                          disabled={Boolean(upgradingPlan)}
                          className="flex-shrink-0 rounded-lg border border-zinc-100/25 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-orange-200/70 hover:text-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {upgradingPlan === plan.slug
                            ? 'Processing...'
                            : plan.slug === 'free'
                            ? 'Downgrade'
                            : 'Choose Plan'}
                        </button>
                      ) : null}
                    </div>
                    {plan.features.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-center gap-1 text-xs text-zinc-400">
                            <span className="text-orange-300">*</span> {feature}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}

          {subscriptionError ? (
            <p className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {subscriptionError}
            </p>
          ) : null}
        </article>
      </div>
    </div>
  )
}
