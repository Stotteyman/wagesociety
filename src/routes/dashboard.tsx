import { createFileRoute, Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  ClipboardList,
  CreditCard,
  DollarSign,
  LayoutDashboard,
  Megaphone,
  NotebookPen,
  Settings,
  Users,
} from 'lucide-react'
import { canManageRole, formatRoleLabel, type BanRecord, type OrgPermission, type OrgRole } from '../lib/orgAccess'
import { authedFetch, getSupabaseBrowserClient } from '../lib/supabaseBrowser'
import { setStoredViewAsRole } from '../lib/viewAs'
import { ProfileSettings } from '../components/ProfileSettings'

const DashboardSearchSchema = z.object({
  view: z.enum(['login', 'signup']).optional(),
})

export const Route = createFileRoute('/dashboard')({
  validateSearch: DashboardSearchSchema,
  head: () => ({
    meta: [
      { title: 'Organization Dashboard — W.A.G.E. Society' },
      {
        name: 'description',
        content: 'Your W.A.G.E. Society organization dashboard for content creation, online marketing, and entrepreneurship execution.',
      },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: DashboardGate,
})

type PlanName = 'Backstage' | 'All Access' | 'Creator Circle'

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
  actorRole: OrgRole
  viewingAs: OrgRole | null
  permissions: OrgPermission[]
  isSuperadmin: boolean
  ban: BanRecord | null
}

type AppUser = {
  email?: string | null
  user_metadata?: {
    full_name?: string
  }
}

const fallbackMembershipPlans: Array<{
  id: string
  slug: string
  name: PlanName
  display_price: string
  description: string
  features: string[]
}> = [
  {
    id: 'fallback-backstage',
    slug: 'backstage',
    name: 'Backstage',
    display_price: '$0',
    description: 'For new builders exploring the organization.',
    features: ['Public knowledge feed', 'Monthly orientation workshop', 'Limited mastermind preview'],
  },
  {
    id: 'fallback-all-access',
    slug: 'all-access',
    name: 'All Access',
    display_price: '$19/mo',
    description: 'For active members building consistent momentum.',
    features: [
      'Full member authentication',
      'Mastermind channels + resource library',
      'Weekly live growth sessions',
      'Campaign and launch announcements',
    ],
  },
  {
    id: 'fallback-creator-circle',
    slug: 'creator-circle',
    name: 'Creator Circle',
    display_price: '$49/mo',
    description: 'For founders and operators scaling online revenue.',
    features: [
      'Advanced creator and marketing systems',
      'Priority partner and promotion access',
      'Private creator war room',
      'Performance and revenue snapshots',
    ],
  },
]

function DashboardGate() {
  const location = useLocation()
  const [member, setMember] = useState<AppUser | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [role, setRole] = useState<OrgRole>('user')
  const [actorRole, setActorRole] = useState<OrgRole>('user')
  const [viewingAs, setViewingAs] = useState<OrgRole | null>(null)
  const [permissions, setPermissions] = useState<OrgPermission[]>([])
  const [ban, setBan] = useState<BanRecord | null>(null)
  const [accessLoading, setAccessLoading] = useState(true)

  const search = Route.useSearch()
  const [authView, setAuthView] = useState<'login' | 'signup'>(search.view === 'signup' ? 'signup' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [membershipPlans, setMembershipPlans] = useState<MembershipPlan[]>(fallbackMembershipPlans)
  const [selectedPlan, setSelectedPlan] = useState<string>('all-access')
  const [busyAction, setBusyAction] = useState<'login' | 'signup' | null>(null)

  useEffect(() => {
    let mounted = true

    const supabase = getSupabaseBrowserClient()

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return
        setMember((data.session?.user as AppUser | undefined) ?? null)
        setReady(true)
      })
      .catch(() => {
        if (!mounted) return
        setReady(true)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setMember((session?.user as AppUser | undefined) ?? null)
      setReady(true)
      setError('')
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/shop')
        if (!response.ok) return

        const data = (await response.json()) as { membershipPlans?: MembershipPlan[] }
        const plans = data.membershipPlans || []
        if (!plans.length) return

        setMembershipPlans(plans)
        setSelectedPlan((current) => (plans.some((plan) => plan.slug === current) ? current : plans[0].slug))
      } catch {
        // Keep fallback plans.
      }
    })()
  }, [])

  useEffect(() => {
    if (!member) {
      setAccessLoading(false)
      return
    }

    void (async () => {
      try {
        const response = await authedFetch('/api/me/access')
        if (!response.ok) {
          setAccessLoading(false)
          return
        }

        const access = (await response.json()) as AccessResponse
        setRole(access.role)
        setActorRole(access.actorRole || access.role)
        setViewingAs(access.viewingAs || null)
        setPermissions(access.permissions || [])
        setBan(access.ban || null)
      } catch {
        // Dashboard can still render with conservative defaults.
      } finally {
        setAccessLoading(false)
      }
    })()
  }, [member])

  const handleLogin = async () => {
    try {
      setError('')
      setBusyAction('login')

      if (typeof window !== 'undefined') {
        const host = window.location.hostname
        const isLocalhost = host === 'localhost' || host === '127.0.0.1'
        if (isLocalhost && email.trim().toLowerCase() === 'root' && password === 'root') {
          setMember({
            email: 'root-superadmin@localhost',
            user_metadata: { full_name: 'Local Root Superadmin' },
          })
          setReady(true)
          return
        }
      }

      const supabase = getSupabaseBrowserClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in. Please try again.')
    } finally {
      setBusyAction(null)
    }
  }

  const handleOAuth = async (provider: 'google' | 'discord' | 'apple') => {
    try {
      setError('')
      setBusyAction('login')
      const supabase = getSupabaseBrowserClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      })
      if (error) throw error
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not sign in with ${provider}.`)
      setBusyAction(null)
    }
  }

  const handleSignup = async () => {
    try {
      setError('')
      setBusyAction('signup')
      const supabase = getSupabaseBrowserClient()
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            membership_plan: selectedPlan,
          },
        },
      })
      if (error) throw error
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account. Please try again.')
    } finally {
      setBusyAction(null)
    }
  }

  const handleLogout = async () => {
    try {
      setStoredViewAsRole(null)
      const supabase = getSupabaseBrowserClient()
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch {
      setError('Could not log out. Please refresh and try again.')
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen px-4 py-24 text-zinc-100">
        <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8 text-center">
          <p className="text-sm uppercase tracking-[0.2em] text-zinc-400">Checking membership status</p>
          <h1 className="mt-4 text-3xl font-bold text-zinc-50">Preparing your access...</h1>
        </div>
      </div>
    )
  }

  if (!member) {
    const isSignup = authView === 'signup'

    return (
      <div className="min-h-screen px-4 py-12 text-zinc-100">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-3xl font-black text-zinc-50 md:text-4xl">
              {isSignup ? 'Create Your Membership' : 'Member Login'}
            </h1>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300/35 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-100"
            >
              <ArrowLeft size={16} /> Back to Home
            </Link>
          </div>

          <div className={`grid gap-8 ${isSignup ? 'lg:grid-cols-[1.25fr_0.75fr]' : 'lg:grid-cols-[1fr_0.6fr]'}`}>
            {isSignup ? (
              <section className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Choose Your Plan</p>
                <h2 className="mt-3 text-3xl font-bold text-zinc-50">Pick the track that matches your growth goals</h2>
                <div className="mt-8 grid gap-5 md:grid-cols-3">
                  {membershipPlans.map((plan) => (
                    <article
                      key={plan.id}
                      className={`rounded-xl border p-5 ${
                        plan.slug === selectedPlan
                          ? 'border-orange-200/70 bg-orange-200/10'
                          : 'border-zinc-200/15 bg-zinc-900/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-lg font-semibold text-zinc-50">{plan.name}</h3>
                        {plan.slug === selectedPlan && <BadgeCheck size={18} className="text-orange-200" />}
                      </div>
                      <p className="mt-2 text-2xl font-black text-orange-200">{plan.display_price}</p>
                      <p className="mt-2 text-sm text-zinc-300">{plan.description}</p>
                      <ul className="mt-4 space-y-2 text-sm text-zinc-200">
                        {plan.features.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <span className="text-orange-200">*</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() => setSelectedPlan(plan.slug)}
                        className="mt-5 w-full rounded-lg border border-zinc-100/25 py-2 text-sm font-semibold text-zinc-50 transition hover:border-orange-200/70 hover:text-orange-100"
                      >
                        Select {plan.name}
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            ) : (
              <section className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Organization Access</p>
                <h2 className="mt-3 text-2xl font-bold text-zinc-50">Welcome back to W.A.G.E. Society</h2>
                <p className="mt-2 text-sm text-zinc-400">Sign in to access your creator dashboard, tools, and membership resources.</p>
                <div className="mt-8 grid gap-4 md:grid-cols-3">
                  {membershipPlans.map((plan) => (
                    <article key={plan.id} className="rounded-xl border border-zinc-200/15 bg-zinc-900/50 p-4">
                      <h3 className="font-semibold text-zinc-50">{plan.name}</h3>
                      <p className="mt-1 text-xl font-black text-orange-200">{plan.display_price}</p>
                      <p className="mt-1 text-xs text-zinc-400">{plan.description}</p>
                    </article>
                  ))}
                </div>
                <p className="mt-6 text-sm text-zinc-400">
                  Not a member yet?{' '}
                  <button
                    type="button"
                    onClick={() => setAuthView('signup')}
                    className="font-semibold text-orange-200 underline underline-offset-4 transition hover:text-orange-100"
                  >
                    Create your account
                  </button>
                </p>
              </section>
            )}

            <section className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8">
              {isSignup ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">New Account</p>
                  <h2 className="mt-3 text-2xl font-bold text-zinc-50">Create your organization profile</h2>
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Already a member?</p>
                  <h2 className="mt-3 text-2xl font-bold text-zinc-50">Sign in to your dashboard</h2>
                </>
              )}
              <div className="mt-6 space-y-4">
                {isSignup ? (
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-zinc-200">Full Name</span>
                    <input
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                      placeholder="Your name"
                    />
                  </label>
                ) : null}
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-zinc-200">
                    {isSignup ? 'Email Address' : 'Email or Username'}
                  </span>
                  <input
                    type="text"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                    placeholder={isSignup ? 'you@email.com' : 'member@email.com (or root on localhost)'}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-zinc-200">Password</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                    placeholder="********"
                  />
                </label>
                {isSignup ? (
                  <div>
                    <span className="mb-2 block text-sm font-medium text-zinc-200">Selected plan</span>
                    <p className="rounded-lg border border-zinc-200/15 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-200">
                      {membershipPlans.find((plan) => plan.slug === selectedPlan)?.name || selectedPlan}
                    </p>
                  </div>
                ) : null}
              </div>

              {error ? (
                <p className="mt-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  {error}
                </p>
              ) : null}

              <div className="mt-6 grid gap-3">
                {isSignup ? (
                  <button
                    type="button"
                    onClick={handleSignup}
                    disabled={busyAction !== null}
                    className="rounded-lg bg-orange-300 px-4 py-2.5 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {busyAction === 'signup' ? 'Creating account...' : 'Create Account'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleLogin}
                    disabled={busyAction !== null}
                    className="rounded-lg bg-orange-300 px-4 py-2.5 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {busyAction === 'login' ? 'Logging in...' : 'Login to Dashboard'}
                  </button>
                )}
              </div>

              <div className="mt-5">
                <div className="relative flex items-center gap-3">
                  <div className="h-px flex-1 bg-zinc-200/15" />
                  <span className="text-xs text-zinc-500">or continue with</span>
                  <div className="h-px flex-1 bg-zinc-200/15" />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleOAuth('google')}
                    disabled={busyAction !== null}
                    className="flex items-center justify-center gap-2 rounded-lg border border-zinc-200/20 bg-zinc-950/40 px-3 py-2.5 text-sm font-medium text-zinc-100 transition hover:border-zinc-100/50 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Sign in with Google"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                    Google
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOAuth('discord')}
                    disabled={busyAction !== null}
                    className="flex items-center justify-center gap-2 rounded-lg border border-zinc-200/20 bg-zinc-950/40 px-3 py-2.5 text-sm font-medium text-zinc-100 transition hover:border-zinc-100/50 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Sign in with Discord"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#5865F2" aria-hidden="true"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
                    Discord
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOAuth('apple')}
                    disabled={busyAction !== null}
                    className="flex items-center justify-center gap-2 rounded-lg border border-zinc-200/20 bg-zinc-950/40 px-3 py-2.5 text-sm font-medium text-zinc-100 transition hover:border-zinc-100/50 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Sign in with Apple"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.56-1.701z"/></svg>
                    Apple
                  </button>
                </div>
                <div className="mt-2">
                  <a
                    href="/api/kick-login"
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200/20 bg-zinc-950/40 px-3 py-2.5 text-sm font-medium text-zinc-100 transition hover:border-zinc-100/50"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#53FC18" aria-hidden="true"><path d="M2 2h5v8.5l5-8.5h6l-6 10 6 10h-6l-5-8.5V22H2z"/></svg>
                    Continue with Kick
                  </a>
                </div>
              </div>
              {isSignup ? (
                <p className="mt-4 text-xs text-zinc-400">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setAuthView('login')}
                    className="font-semibold text-orange-200 underline underline-offset-4 transition hover:text-orange-100"
                  >
                    Sign in instead
                  </button>
                </p>
              ) : (
                <p className="mt-4 text-xs text-zinc-400">
                  On localhost, use username <code className="text-zinc-300">root</code> and password{' '}
                  <code className="text-zinc-300">root</code> for local root admin access.
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    )
  }

  if (accessLoading) {
    return (
      <div className="min-h-screen px-4 py-24 text-zinc-100">
        <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8 text-center">
          <p className="text-sm uppercase tracking-[0.2em] text-zinc-400">Loading permissions</p>
          <h1 className="mt-4 text-3xl font-bold text-zinc-50">Preparing your function access...</h1>
        </div>
      </div>
    )
  }

  if (location.pathname.startsWith('/dashboard/tools/')) {
    return <Outlet />
  }

  return (
    <CreatorDashboard
      member={member}
      onLogout={handleLogout}
      role={role}
      actorRole={actorRole}
      viewingAs={viewingAs}
      permissions={permissions}
      ban={ban}
    />
  )
}

function CreatorDashboard({
  member,
  onLogout,
  role,
  actorRole,
  viewingAs,
  permissions,
  ban,
}: {
  member: AppUser
  onLogout: () => Promise<void>
  role: OrgRole
  actorRole: OrgRole
  viewingAs: OrgRole | null
  permissions: OrgPermission[]
  ban: BanRecord | null
}) {
  const [dashboardTab, setDashboardTab] = useState<'workspace' | 'settings'>('workspace')
  const isSuperadmin = role === 'superadmin'
  const canUseViewAs = actorRole === 'superadmin' || canManageRole(actorRole, 'user')
  const selectableRoles: OrgRole[] = [
    'admin',
    'manager',
    'staff',
    'moderator',
    'helper',
    'user',
    'banned',
  ].filter((candidate) => {
    if (actorRole === 'superadmin') return true
    return canManageRole(actorRole, candidate)
  })

  const hasPermission = (permission: OrgPermission) => {
    if (isSuperadmin) return true
    return permissions.includes(permission)
  }

  const dashboardFunctions: Array<{
    icon: React.ReactNode
    toolKey:
      | 'bulletin-board'
      | 'content-calendar'
      | 'revenue-tracker'
      | 'creator-task-board'
      | 'collaboration-hub'
      | 'knowledge-vault'
    title: string
    description: string
    items: string[]
    requiredPermission: OrgPermission
  }> = [
    {
      icon: <Megaphone size={18} />,
      toolKey: 'bulletin-board',
      title: 'Bulletin Board',
      description: 'Post launches, promotions, and collaboration requests to keep your team and peers aligned.',
      items: ['Announcement drafts', 'Pinned growth opportunities', 'Deadline reminders'],
      requiredPermission: 'view_creator_tools',
    },
    {
      icon: <CalendarDays size={18} />,
      toolKey: 'content-calendar',
      title: 'Content Calendar',
      description: 'Plan videos, newsletters, social campaigns, and product drops across a weekly cadence.',
      items: ['Publishing cadence', 'Campaign timeline', 'Cross-platform sync'],
      requiredPermission: 'view_creator_tools',
    },
    {
      icon: <DollarSign size={18} />,
      toolKey: 'revenue-tracker',
      title: 'Revenue Tracker',
      description: 'Track recurring income streams and monitor which offers convert best every month.',
      items: ['Membership revenue', 'Funnel outcomes', 'Offer performance'],
      requiredPermission: 'view_revenue_tracker',
    },
    {
      icon: <ClipboardList size={18} />,
      toolKey: 'creator-task-board',
      title: 'Creator Task Board',
      description: 'Break goals into weekly sprint tasks and keep momentum with clear priorities.',
      items: ['This-week priorities', 'Pending reviews', 'Automation backlog'],
      requiredPermission: 'view_creator_tools',
    },
    {
      icon: <Users size={18} />,
      toolKey: 'collaboration-hub',
      title: 'Collaboration Hub',
      description: 'Coordinate partner campaigns, joint launches, and audience growth collaborations.',
      items: ['Partner shortlist', 'Joint launch plans', 'Shared asset links'],
      requiredPermission: 'view_creator_tools',
    },
    {
      icon: <NotebookPen size={18} />,
      toolKey: 'knowledge-vault',
      title: 'Knowledge Vault',
      description: 'Store swipe files, scripts, hooks, and reusable frameworks for repeatable execution.',
      items: ['Best-performing hooks', 'Marketing scripts', 'Template library'],
      requiredPermission: 'view_creator_tools',
    },
  ]

  const visibleFunctions = dashboardFunctions.filter((fn) => hasPermission(fn.requiredPermission))

  if (role === 'banned') {
    return <BannedDashboard member={member} onLogout={onLogout} ban={ban} />
  }

  const applyViewAs = (targetRole: string) => {
    if (!canUseViewAs) return

    setStoredViewAsRole(targetRole ? (targetRole as OrgRole) : null)
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  return (
    <div className="min-h-screen px-4 py-12 text-zinc-100">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Organization Dashboard</p>
              <h1 className="mt-2 text-3xl font-black text-zinc-50 md:text-4xl">
                Welcome back, {member.user_metadata?.full_name || member.email || 'Member'}
              </h1>
              <p className="mt-3 max-w-2xl text-zinc-300">
                Run your creator pipeline, marketing campaigns, and entrepreneurial execution with a focused operating system.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-zinc-500/40 px-3 py-1 uppercase tracking-wide text-zinc-300">
                  Role: {formatRoleLabel(role)}
                </span>
                {viewingAs ? (
                  <span className="rounded-full border border-rose-400/60 px-3 py-1 uppercase tracking-wide text-rose-200">
                    Viewing As: {formatRoleLabel(viewingAs)}
                  </span>
                ) : null}
                {isSuperadmin ? (
                  <span className="rounded-full border border-orange-300/60 px-3 py-1 uppercase tracking-wide text-orange-100">
                    Full Access
                  </span>
                ) : null}
              </div>
              {canUseViewAs ? (
                <div className="mt-4 max-w-sm rounded-xl border border-rose-400/35 bg-rose-500/10 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-200">View As Mode</p>
                  <div className="mt-2 flex items-center gap-2">
                    <select
                      value={viewingAs || ''}
                      onChange={(event) => applyViewAs(event.target.value)}
                      className="w-full rounded-lg border border-rose-300/35 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-rose-200"
                    >
                      <option value="">Off (your role)</option>
                      {selectableRoles.map((previewRole) => (
                        <option key={previewRole} value={previewRole}>
                          {formatRoleLabel(previewRole)}
                        </option>
                      ))}

                    </select>
                    {viewingAs ? (
                      <button
                        type="button"
                        onClick={() => applyViewAs('')}
                        className="rounded-lg border border-rose-300/45 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-rose-100 transition hover:border-rose-200"
                      >
                        Reset
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex gap-3">
              <Link
                to="/"
                className="rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100"
              >
                Home
              </Link>
              {hasPermission('access_admin_dashboard') ? (
                <Link
                  to="/admin"
                  className="rounded-lg border border-orange-300/45 px-4 py-2 text-sm font-semibold text-orange-100 transition hover:border-orange-200 hover:text-orange-50"
                >
                  Admin
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  void onLogout()
                }}
                className="rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <div className="mt-6 flex gap-1 rounded-xl border border-zinc-200/15 bg-zinc-900/60 p-1">
          <button
            type="button"
            onClick={() => setDashboardTab('workspace')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              dashboardTab === 'workspace'
                ? 'bg-orange-300 text-zinc-950'
                : 'text-zinc-300 hover:text-zinc-50'
            }`}
          >
            <LayoutDashboard size={15} />
            Workspace
          </button>
          <button
            type="button"
            onClick={() => setDashboardTab('settings')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              dashboardTab === 'settings'
                ? 'bg-orange-300 text-zinc-950'
                : 'text-zinc-300 hover:text-zinc-50'
            }`}
          >
            <Settings size={15} />
            Settings
          </button>
        </div>

        {dashboardTab === 'workspace' ? (
          <section className="mt-6">
            <div className="mb-4">
              <h2 className="text-2xl font-bold text-zinc-50">Workspace</h2>
              <p className="mt-1 text-sm text-zinc-300">Your assigned creator modules are listed below.</p>
            </div>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {visibleFunctions.map((fn) => (
                <ResourceCard
                  key={fn.title}
                  icon={fn.icon}
                  toolKey={fn.toolKey}
                  title={fn.title}
                  description={fn.description}
                  items={fn.items}
                />
              ))}

              {!visibleFunctions.length ? (
                <article className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5 md:col-span-2 lg:col-span-3">
                  <h2 className="text-xl font-bold text-zinc-50">No Functions Assigned Yet</h2>
                  <p className="mt-2 text-sm text-zinc-300">
                    Your account has no dashboard functions enabled yet. Ask an admin or superadmin to grant permissions.
                  </p>
                </article>
              ) : null}
            </div>
          </section>
        ) : (
          <section className="mt-6 space-y-6">
            <ProfileSettings member={member} />
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
              <div className="mt-4 rounded-xl border border-zinc-200/15 bg-zinc-950/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Current Plan</p>
                <p className="mt-2 text-xl font-black text-orange-200">
                  {formatRoleLabel(role)}
                </p>
                <p className="mt-1 text-sm text-zinc-300">
                  {role === 'user'
                    ? 'Backstage — free tier. Upgrade for full creator access.'
                    : role === 'member'
                    ? 'Active membership. Full creator dashboard access.'
                    : `Organization role: ${formatRoleLabel(role)}.`}
                </p>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <Link
                  to="/checkout"
                  search={{ plan: 'all-access' }}
                  className="flex items-center justify-center gap-2 rounded-lg bg-orange-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200"
                >
                  Upgrade to All Access — $19/mo
                </Link>
                <Link
                  to="/checkout"
                  search={{ plan: 'creator-circle' }}
                  className="flex items-center justify-center gap-2 rounded-lg border border-zinc-100/25 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100"
                >
                  Upgrade to Creator Circle — $49/mo
                </Link>
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                Payments are processed securely via Stripe. Cancel anytime from your billing settings.
              </p>
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
                <div>
                  <p className="text-xs font-medium text-zinc-400">Email</p>
                  <p className="mt-0.5 text-sm text-zinc-100">{member.email || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-400">Name</p>
                  <p className="mt-0.5 text-sm text-zinc-100">{member.user_metadata?.full_name || '—'}</p>
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
          </section>
        )}
      </div>
    </div>
  )
}

function BannedDashboard({
  member,
  onLogout,
  ban,
}: {
  member: AppUser
  onLogout: () => Promise<void>
  ban: BanRecord | null
}) {
  const bannedUntilLabel = ban?.bannedUntil ? new Date(ban.bannedUntil).toLocaleString() : 'Forever'

  return (
    <div className="min-h-screen px-4 py-12 text-zinc-100">
      <div className="mx-auto max-w-4xl rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-200">Account Restricted</p>
        <h1 className="mt-3 text-3xl font-black text-zinc-50 md:text-4xl">You are currently banned</h1>
        <p className="mt-4 text-base leading-relaxed text-zinc-200">
          {member.email || 'This account'} was banned by {ban?.bannedBy || 'an administrator'} for{' '}
          {ban?.banReason || 'a policy violation'} until {bannedUntilLabel}. Click here to{' '}
          <Link to="/appeals" className="font-semibold text-rose-100 underline underline-offset-4 transition hover:text-white">
            appeal
          </Link>
          .
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/"
            className="rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-rose-200/70 hover:text-rose-100"
          >
            Return Home
          </Link>
          <button
            type="button"
            onClick={() => {
              void onLogout()
            }}
            className="rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-rose-200/70 hover:text-rose-100"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  )
}

function ResourceCard({
  icon,
  toolKey,
  title,
  description,
  items,
}: {
  icon: React.ReactNode
  toolKey:
    | 'bulletin-board'
    | 'content-calendar'
    | 'revenue-tracker'
    | 'creator-task-board'
    | 'collaboration-hub'
    | 'knowledge-vault'
  title: string
  description: string
  items: string[]
}) {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={() => {
        void navigate({
          to: '/dashboard/tools/$tool',
          params: { tool: toolKey },
        })
      }}
      className="group block w-full rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5 text-left transition hover:border-orange-300/50"
    >
      <article>
        <div className="mb-3 inline-flex rounded-md border border-zinc-200/20 bg-zinc-950/70 p-2 text-orange-200">
          {icon}
        </div>
        <h2 className="text-xl font-bold text-zinc-50 group-hover:text-orange-100">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">{description}</p>
        <ul className="mt-4 space-y-2 text-sm text-zinc-200">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-orange-200">*</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </article>
    </button>
  )
}
