import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ArrowLeft, CreditCard, Settings } from 'lucide-react'
import { ProfileSettings } from '../components/ProfileSettings'
import { formatRoleLabel, type OrgRole } from '../lib/orgAccess'
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

type AccessResponse = {
  role: OrgRole
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

function getSettingsUsername(member: AppUser | null) {
  const username = String(member?.user_metadata?.username || '').trim()
  const preferred = String(member?.user_metadata?.preferred_username || '').trim()
  const fromEmail = String(member?.email || '').split('@')[0].trim()
  return username || preferred || fromEmail || 'Member'
}

export const Route = createFileRoute('/settings')({
  beforeLoad: async () => {
    await requireAuthenticatedRoute('/login')
  },
  head: () => ({
    meta: [
      { title: 'Settings — W.A.G.E. Society' },
      {
        name: 'description',
        content: 'Manage your profile, linked accounts, and membership settings.',
      },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: SettingsPage,
})

function SettingsPage() {
  const [member, setMember] = useState<AppUser | null>(null)
  const [memberAvatarUrl, setMemberAvatarUrl] = useState<string | null>(null)
  const [role, setRole] = useState<OrgRole>('user')
  const [plans, setPlans] = useState<MembershipPlan[]>(fallbackMembershipPlans)
  const [plansLoading, setPlansLoading] = useState(true)
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null)
  const [subscriptionError, setSubscriptionError] = useState('')
  const [loading, setLoading] = useState(true)

  const linkedProvider = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('linked')
    : null

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
    if (!member) return
    void (async () => {
      try {
        const response = await authedFetch('/api/me/profile')
        if (!response.ok) return
        const data = (await response.json()) as { profile?: { avatar_url?: string | null } }
        setMemberAvatarUrl(data.profile?.avatar_url || null)
      } catch {
        // Optional display data.
      }
    })()
  }, [member])

  useEffect(() => {
    if (!member) return
    void (async () => {
      try {
        const response = await authedFetch('/api/me/access')
        if (!response.ok) return
        const access = (await response.json()) as AccessResponse
        setRole(access.role || 'user')
      } catch {
        // Keep default role.
      }
    })()
  }, [member])

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

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (!params.get('linked')) return
    window.history.replaceState({}, '', window.location.pathname)
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
          name: getSettingsUsername(member),
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
          <p className="text-sm uppercase tracking-[0.2em] text-zinc-400">Loading settings</p>
          <h1 className="mt-4 text-3xl font-bold text-zinc-50">Preparing your profile...</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-12 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Account Settings</p>
              <h1 className="mt-2 text-3xl font-black text-zinc-50 md:text-4xl">Manage your workspace profile</h1>
              <p className="mt-3 max-w-2xl text-zinc-300">
                Update your username, linked stream accounts, and membership preferences from one place.
              </p>
            </div>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100"
            >
              <ArrowLeft size={16} />
              Back to Dashboard
            </Link>
          </div>
        </header>

        <ProfileSettings member={{ email: member.email || '' }} linkedProvider={linkedProvider} />

        <div className="grid gap-6 md:grid-cols-2">
          <article className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
            <div className="flex items-center gap-3">
              <div className="inline-flex rounded-md border border-zinc-200/20 bg-zinc-950/70 p-2 text-orange-200">
                <CreditCard size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-zinc-50">Subscription</h2>
                <p className="text-xs text-zinc-400">Manage your membership plan</p>
              </div>
            </div>

            {plansLoading ? (
              <p className="mt-4 text-sm text-zinc-400">Loading plans...</p>
            ) : (
              <div className="mt-4 space-y-2">
                {plans.map((plan) => {
                  const isCurrent =
                    member.user_metadata?.membership_plan === plan.slug ||
                    (plan.slug === 'free' && !member.user_metadata?.membership_plan)

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

          <article className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
            <div className="flex items-center gap-3">
              <div className="inline-flex rounded-md border border-zinc-200/20 bg-zinc-950/70 p-2 text-orange-200">
                <Settings size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-zinc-50">Account</h2>
                <p className="text-xs text-zinc-400">Your profile and sign-in details</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-zinc-200/15 bg-zinc-950/60 p-4 space-y-2">
              {memberAvatarUrl ? (
                <div className="flex items-center gap-3">
                  <img
                    src={memberAvatarUrl}
                    alt={getSettingsUsername(member)}
                    className="h-12 w-12 rounded-full border border-zinc-200/20 object-cover"
                  />
                  <p className="text-xs text-zinc-500">Profile photo is managed in your settings above.</p>
                </div>
              ) : null}
              <div>
                <p className="text-xs font-medium text-zinc-400">Email</p>
                <p className="mt-0.5 text-sm text-zinc-100">{member.email || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-400">Username</p>
                <p className="mt-0.5 text-sm text-zinc-100">{getSettingsUsername(member)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-400">Role</p>
                <p className="mt-0.5 text-sm text-zinc-100">{formatRoleLabel(role)}</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-zinc-500">
              To update your email or password, contact an admin or use the password reset flow.
            </p>
          </article>
        </div>
      </div>
    </div>
  )
}
