import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Loader2, Sparkles, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { authedFetch, getSupabaseBrowserClient } from '../lib/supabaseBrowser'
import { requireAuthenticatedRoute } from '../lib/routeAuth'

type ProfileApiResponse = {
  profile?: {
    email: string
    display_name: string | null
    avatar_url: string | null
    bio: string | null
    skills: string[] | null
  }
  error?: string
}

type ShopPlan = {
  id: string
  slug: string
  name: string
  display_price: string
  price_cents: number
  description: string
  features: string[]
}

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/

export const Route = createFileRoute('/onboarding')({
  beforeLoad: async () => {
    await requireAuthenticatedRoute('/login', { skipOnboardingCheck: true })
  },
  head: () => ({
    meta: [
      { title: 'Onboarding — W.A.G.E. Society' },
      {
        name: 'description',
        content: 'Set up your account and choose whether to upgrade beyond the free tier.',
      },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: OnboardingPage,
})

function OnboardingPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [bio, setBio] = useState('')
  const [skillsInput, setSkillsInput] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
  const [usernameMessage, setUsernameMessage] = useState('')
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null)
  const [plans, setPlans] = useState<ShopPlan[]>([])
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user?.email) {
          void navigate({ to: '/login' })
          return
        }

        const meta = (user.user_metadata as Record<string, unknown> | undefined) || {}
        if (meta.onboarding_completed === true) {
          void navigate({ to: '/dashboard' })
          return
        }

        if (!meta.membership_plan) {
          await supabase.auth.updateUser({
            data: {
              ...meta,
              membership_plan: 'free',
              onboarding_completed: false,
            },
          })
        }

        setEmail(user.email)
        const seedName =
          String(meta.username || '').trim() ||
          String(meta.preferred_username || '').trim() ||
          user.email.split('@')[0] ||
          ''
        setDisplayName(seedName)

        const [profileResponse, plansResponse] = await Promise.all([
          authedFetch('/api/me/profile'),
          fetch('/api/shop'),
        ])

        if (profileResponse.ok) {
          const profileData = (await profileResponse.json()) as ProfileApiResponse
          const profile = profileData.profile
          if (profile) {
            setDisplayName(profile.display_name || seedName)
            setAvatarUrl(profile.avatar_url || '')
            setBio(profile.bio || '')
            setSkillsInput((profile.skills || []).join(', '))
          }
        }

        if (plansResponse.ok) {
          const plansData = (await plansResponse.json()) as { membershipPlans?: ShopPlan[] }
          setPlans((plansData.membershipPlans || []).filter((plan) => plan.slug !== 'free'))
        }
      } catch {
        setError('Could not load onboarding. Please refresh and try again.')
      } finally {
        setLoading(false)
      }
    })()
  }, [navigate])

  const checkUsername = (value: string) => {
    if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current)
    const trimmed = value.trim()

    if (!trimmed) {
      setUsernameStatus('idle')
      setUsernameMessage('')
      return
    }

    if (!USERNAME_REGEX.test(trimmed)) {
      setUsernameStatus('invalid')
      setUsernameMessage('3–20 characters. Letters, numbers, underscores, hyphens only.')
      return
    }

    setUsernameStatus('checking')
    setUsernameMessage('')
    usernameDebounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(
            `/api/check-username?username=${encodeURIComponent(trimmed)}&currentEmail=${encodeURIComponent(email)}`,
          )

          if (!response.ok) {
            setUsernameStatus('idle')
            setUsernameMessage('Could not verify availability right now.')
            return
          }

          const data = (await response.json()) as { available?: boolean; reason?: string }

          if (data.available === true) {
            setUsernameStatus('available')
            setUsernameMessage('Username is available!')
          } else {
            setUsernameStatus('taken')
            setUsernameMessage(data.reason || 'Username is already taken.')
          }
        } catch {
          setUsernameStatus('idle')
          setUsernameMessage('')
        }
      })()
    }, 400)
  }

  const ensureUsernameAvailable = async () => {
    const trimmed = displayName.trim()
    if (!trimmed) return false
    if (!USERNAME_REGEX.test(trimmed)) return false

    const response = await fetch(
      `/api/check-username?username=${encodeURIComponent(trimmed)}&currentEmail=${encodeURIComponent(email)}`,
    )

    if (!response.ok) {
      // Do not block onboarding on temporary availability-check issues.
      return true
    }

    const data = (await response.json()) as { available?: boolean; reason?: string }
    if (!data.available) {
      setError(data.reason || 'That username is already taken. Please choose another.')
      return false
    }

    return true
  }

  const finishOnboarding = async () => {
    setSaving(true)
    setError('')

    try {
      const trimmedName = displayName.trim()
      if (!trimmedName) {
        setError('Username is required.')
        return
      }
      if (!USERNAME_REGEX.test(trimmedName)) {
        setError('Username must be 3–20 characters with letters, numbers, underscores, or hyphens.')
        return
      }
      if (!(await ensureUsernameAvailable())) {
        return
      }

      const profileResponse = await authedFetch('/api/me/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: trimmedName,
          avatarUrl: avatarUrl.trim() || '',
          bio: bio.trim() || undefined,
          skills: skillsInput
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      })

      const profileData = (await profileResponse.json()) as { error?: string }
      if (!profileResponse.ok) {
        setError(profileData.error || 'Could not save profile. Please try again.')
        return
      }

      const supabase = getSupabaseBrowserClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const meta = (user.user_metadata as Record<string, unknown> | undefined) || {}
        const { error: updateError } = await supabase.auth.updateUser({
          data: {
            ...meta,
            username: trimmedName,
            preferred_username: trimmedName,
            membership_plan: String(meta.membership_plan || 'free'),
            onboarding_completed: true,
          },
        })

        if (updateError) {
          setError(updateError.message)
          return
        }
      }

      await navigate({ to: '/dashboard' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete onboarding.')
    } finally {
      setSaving(false)
    }
  }

  const upgradeNow = async (plan: ShopPlan) => {
    try {
      setUpgradingPlan(plan.slug)
      setError('')

      const response = await authedFetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planSlug: plan.slug,
          email,
          name: displayName.trim() || undefined,
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
        setError(data.error || 'Could not start upgrade checkout.')
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
        await navigate({ to: '/dashboard' })
      }
    } catch {
      setError('Could not start upgrade checkout.')
    } finally {
      setUpgradingPlan(null)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen px-4 py-14 text-zinc-100">
        <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8">
          <p className="inline-flex items-center gap-2 text-sm text-zinc-300">
            <Loader2 size={15} className="animate-spin" /> Preparing onboarding...
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-3xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Welcome to W.A.G.E.</p>
          <h1 className="mt-2 text-3xl font-black text-zinc-50">Set up your account</h1>
          <p className="mt-2 text-sm text-zinc-300">
            Your account starts on the FREE plan. Finish username and profile setup now, then optionally upgrade.
          </p>
        </section>

        <section className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
          <h2 className="text-xl font-bold text-zinc-50">1. Choose your username + profile</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Username</label>
              <input
                type="text"
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value)
                  checkUsername(event.target.value)
                }}
                maxLength={20}
                autoComplete="username"
                className={`w-full rounded-lg border bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition ${
                  usernameStatus === 'available'
                    ? 'border-emerald-400/60 focus:border-emerald-300'
                    : usernameStatus === 'taken' || usernameStatus === 'invalid'
                    ? 'border-rose-400/60 focus:border-rose-300'
                    : 'border-zinc-200/20 focus:border-orange-200/70'
                }`}
                placeholder="your_username"
              />
              {usernameStatus === 'checking' ? (
                <p className="mt-1 text-xs text-zinc-400">Checking availability...</p>
              ) : usernameMessage ? (
                <p className={`mt-1 text-xs ${usernameStatus === 'available' ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {usernameMessage}
                </p>
              ) : (
                <p className="mt-1 text-xs text-zinc-500">3–20 characters. Letters, numbers, underscores, hyphens.</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Avatar URL (optional)</label>
              <div className="flex items-center gap-3">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="h-10 w-10 rounded-full border border-zinc-200/20 object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200/20 bg-zinc-800 text-zinc-400">
                    <UserRound size={16} />
                  </div>
                )}
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(event) => setAvatarUrl(event.target.value)}
                  className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-200/70"
                  placeholder="https://example.com/avatar.jpg"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Bio (optional)</label>
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                rows={3}
                maxLength={500}
                className="w-full resize-none rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-200/70"
                placeholder="Tell members what you create and what you're building."
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Skills (optional)</label>
              <input
                type="text"
                value={skillsInput}
                onChange={(event) => setSkillsInput(event.target.value)}
                className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-200/70"
                placeholder="Video editing, Marketing, Live production"
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-orange-200" />
            <h2 className="text-xl font-bold text-zinc-50">2. Upgrade now (optional)</h2>
          </div>
          <p className="mt-2 text-sm text-zinc-300">You're currently on FREE. Upgrade now or finish onboarding and upgrade later from your dashboard.</p>

          {plans.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {plans.map((plan) => (
                <article key={plan.id} className="rounded-xl border border-zinc-200/15 bg-zinc-950/40 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-zinc-100">{plan.name}</h3>
                    <p className="text-sm font-bold text-orange-200">{plan.display_price}</p>
                  </div>
                  <p className="mt-2 text-xs text-zinc-400">{plan.description}</p>
                  <button
                    type="button"
                    onClick={() => {
                      void upgradeNow(plan)
                    }}
                    disabled={upgradingPlan !== null}
                    className="mt-3 rounded-lg border border-zinc-100/25 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition hover:border-orange-200/70 disabled:opacity-60"
                  >
                    {upgradingPlan === plan.slug ? 'Starting...' : `Upgrade to ${plan.name}`}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">Upgrade plans are unavailable right now. You can continue with FREE and upgrade later.</p>
          )}
        </section>

        {error ? (
          <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              void finishOnboarding()
            }}
            disabled={saving}
            className="rounded-lg bg-orange-300 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70"
          >
            {saving ? 'Saving...' : 'Finish Onboarding'}
          </button>
          <button
            type="button"
            onClick={() => {
              void finishOnboarding()
            }}
            className="rounded-lg border border-zinc-100/25 px-5 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70"
          >
            Continue with FREE for now
          </button>
        </div>
      </div>
    </main>
  )
}
