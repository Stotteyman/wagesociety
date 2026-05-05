import { createFileRoute, Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  CreditCard,
  DollarSign,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Newspaper,
  NotebookPen,
  Radio,
  Settings,
  Shield,
  Store,
  Target,
  Users,
} from 'lucide-react'
import { canManageRole, formatRoleLabel, type BanRecord, type OrgPermission, type OrgRole } from '../lib/orgAccess'
import { endLocalRootSession, getLocalRootUser, isLocalRootSessionActive } from '../lib/localRootSession'
import { authedFetch, getSupabaseBrowserClient } from '../lib/supabaseBrowser'
import { requireAuthenticatedRoute } from '../lib/routeAuth'
import { setStoredViewAsRole } from '../lib/viewAs'
import { ProfileSettings } from '../components/ProfileSettings'

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async () => {
    await requireAuthenticatedRoute('/login')
  },
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
    username?: string
    preferred_username?: string
    membership_plan?: string
  }
}

function getDashboardUsername(member: AppUser | null) {
  const username = String(member?.user_metadata?.username || '').trim()
  const preferred = String(member?.user_metadata?.preferred_username || '').trim()
  const fromEmail = String(member?.email || '').split('@')[0].trim()
  return username || preferred || fromEmail || 'Member'
}

type NewsItem = {
  id: string
  title: string
  body: string
  created_at: string
  author: string
}

const LOCAL_ROOT_PERMISSIONS: OrgPermission[] = [
  'view_dashboard',
  'view_creator_tools',
  'view_revenue_tracker',
  'view_live_streams',
  'use_autoclipper',
  'manage_livestreams',
  'view_merch',
  'manage_users',
  'manage_permissions',
  'access_admin_dashboard',
]

const fallbackMembershipPlans: Array<{
  id: string
  slug: string
  name: string
  display_price: string
  description: string
  features: string[]
}> = [
  {
    id: 'fallback-free',
    slug: 'free',
    name: 'FREE',
    display_price: '$0',
    description: 'Very limited access for basic account setup and browsing.',
    features: ['Log in and account access', 'Connect social/OAuth accounts', 'Browse public sections'],
  },
]

function DashboardGate() {
  const location = useLocation()
  const navigate = useNavigate()
  const [member, setMember] = useState<AppUser | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [role, setRole] = useState<OrgRole>('user')
  const [actorRole, setActorRole] = useState<OrgRole>('user')
  const [viewingAs, setViewingAs] = useState<OrgRole | null>(null)
  const [permissions, setPermissions] = useState<OrgPermission[]>([])
  const [ban, setBan] = useState<BanRecord | null>(null)
  const [accessLoading, setAccessLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    if (isLocalRootSessionActive()) {
      setMember(getLocalRootUser() as AppUser)
      setRole('superadmin')
      setActorRole('superadmin')
      setPermissions(LOCAL_ROOT_PERMISSIONS)
      setAccessLoading(false)
      setReady(true)
      return () => {
        mounted = false
      }
    }

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
    if (isLocalRootSessionActive()) {
      setAccessLoading(false)
      return
    }

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

  const handleLogout = async () => {
    try {
      setStoredViewAsRole(null)

      if (isLocalRootSessionActive()) {
        endLocalRootSession()
        void navigate({ to: '/login' })
        return
      }

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

  if (!member) {
    void navigate({ to: '/login' })
    return null
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
  member: AppUser | null
  onLogout: () => Promise<void>
  role: OrgRole
  actorRole: OrgRole
  viewingAs: OrgRole | null
  permissions: OrgPermission[]
  ban: BanRecord | null
}) {
  const [dashboardTab, setDashboardTab] = useState<'motd' | 'news' | 'workspace' | 'settings'>('motd')

  // Restore the intended tab after an OAuth redirect (e.g. Kick account linking).
  // Priority: ?view= URL param → sessionStorage key set before the redirect.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const viewParam = params.get('view')
    const storedTab = sessionStorage.getItem('dashboard_return_tab')
    sessionStorage.removeItem('dashboard_return_tab')
    const tab = viewParam || storedTab
    if (tab === 'settings' || tab === 'news' || tab === 'workspace' || tab === 'motd') {
      setDashboardTab(tab as 'motd' | 'news' | 'workspace' | 'settings')
    }
  }, [])

  const [latestNews, setLatestNews] = useState<NewsItem[]>([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [plans, setPlans] = useState<MembershipPlan[]>(fallbackMembershipPlans)
  const [plansLoading, setPlansLoading] = useState(true)
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null)
  const [subscriptionError, setSubscriptionError] = useState('')
  const [memberAvatarUrl, setMemberAvatarUrl] = useState<string | null>(null)
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
      | 'promotion-hub'
      | 'merch-studio'
      | 'creator-growth-system'
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
    {
      icon: <Radio size={18} />,
      toolKey: 'promotion-hub',
      title: 'Promotion Hub',
      description: 'Compose and schedule posts to Kick, Twitch, X, Instagram, and Threads from one place.',
      items: ['Write once, post anywhere', 'Schedule your queue', 'Platform-tailored previews'],
      requiredPermission: 'view_creator_tools',
    },
    {
      icon: <Store size={18} />,
      toolKey: 'merch-studio',
      title: 'Merch Studio',
      description: 'Submit your merch mockups, track admin review status, and monitor your earnings splits.',
      items: ['Design submissions', 'Approval status', 'Earnings & payouts'],
      requiredPermission: 'view_merch',
    },
    {
      icon: <Target size={18} />,
      toolKey: 'creator-growth-system',
      title: 'Creator Growth System',
      description: 'Build and track your creator operating system across 5 modules: broadcast, hub, monetization, distribution, and operations.',
      items: ['Creator System Score', '5-module checklist', 'Next action guidance'],
      requiredPermission: 'view_creator_tools',
    },
  ]

  const visibleFunctions = dashboardFunctions.filter((fn) => hasPermission(fn.requiredPermission))
  const dashboardDisplayName = getDashboardUsername(member)

  useEffect(() => {
    if (isLocalRootSessionActive()) return
    void (async () => {
      try {
        const response = await authedFetch('/api/me/profile')
        if (!response.ok) return
        const data = (await response.json()) as { profile?: { avatar_url?: string | null } }
        setMemberAvatarUrl(data.profile?.avatar_url || null)
      } catch {
        // avatar is optional, ignore errors
      }
    })()
  }, [])

  useEffect(() => {
    if (isLocalRootSessionActive()) {
      setPlansLoading(false)
      return
    }

    void (async () => {
      try {
        const response = await fetch('/api/shop')
        if (!response.ok) return
        const data = (await response.json()) as { membershipPlans?: MembershipPlan[] }
        if (data.membershipPlans?.length) setPlans(data.membershipPlans)
      } catch {
        // keep fallback plans
      } finally {
        setPlansLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (isLocalRootSessionActive()) {
      setLatestNews([])
      setNewsLoading(false)
      return
    }

    void (async () => {
      setNewsLoading(true)
      try {
        const response = await fetch('/api/news')
        if (!response.ok) return

        const data = (await response.json()) as NewsItem[]
        setLatestNews(Array.isArray(data) ? data.slice(0, 5) : [])
      } catch {
        setLatestNews([])
      } finally {
        setNewsLoading(false)
      }
    })()
  }, [])

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
          name: getDashboardUsername(member),
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

  return (
    <div className="min-h-screen px-4 py-12 text-zinc-100">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-4">
                {memberAvatarUrl ? (
                  <img
                    src={memberAvatarUrl}
                    alt={dashboardDisplayName}
                    className="h-16 w-16 flex-shrink-0 rounded-full border border-zinc-200/20 object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full border border-zinc-200/20 bg-zinc-800 text-xl font-bold text-zinc-400">
                    {dashboardDisplayName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Organization Dashboard</p>
                  <h1 className="mt-1 text-3xl font-black text-zinc-50 md:text-4xl">
                    Welcome back, {dashboardDisplayName}
                  </h1>
                </div>
              </div>
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
          </div>

          <div className="mt-6 border-t border-zinc-200/10 pt-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Dashboard Sections</p>
            <div className="-mx-1 overflow-x-auto px-1">
              <div className="flex min-w-max gap-1 rounded-xl border border-zinc-200/15 bg-zinc-900/60 p-1">
                <button
                  type="button"
                  onClick={() => setDashboardTab('motd')}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    dashboardTab === 'motd'
                      ? 'bg-orange-300 text-zinc-950'
                      : 'text-zinc-300 hover:text-zinc-50'
                  }`}
                >
                  <Megaphone size={15} />
                  MOTD
                </button>
                <button
                  type="button"
                  onClick={() => setDashboardTab('news')}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    dashboardTab === 'news'
                      ? 'bg-orange-300 text-zinc-950'
                      : 'text-zinc-300 hover:text-zinc-50'
                  }`}
                >
                  <Newspaper size={15} />
                  Latest News
                </button>
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
                {hasPermission('access_admin_dashboard') && (
                  <Link
                    to="/admin"
                    className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:text-zinc-50"
                  >
                    <Shield size={15} />
                    Admin
                  </Link>
                )}
              </div>
            </div>
          </div>
        </header>

        {dashboardTab === 'motd' ? (
          <section className="mt-6">
            <article className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">MOTD</p>
              <h2 className="mt-2 text-2xl font-bold text-zinc-50">Build momentum today</h2>
              <p className="mt-3 max-w-3xl text-zinc-300">
                Ship one meaningful piece of content, complete one revenue task, and check in with one collaborator before your day ends.
              </p>
            </article>
          </section>
        ) : null}

        {dashboardTab === 'news' ? (
          <section className="mt-6 space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-zinc-50">Latest News</h2>
              <p className="mt-1 text-sm text-zinc-300">Recent organization announcements and updates.</p>
            </div>
            {newsLoading ? <p className="text-sm text-zinc-300">Loading latest news...</p> : null}
            {!newsLoading && latestNews.length === 0 ? (
              <article className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5">
                <h3 className="text-lg font-semibold text-zinc-50">No news posted yet</h3>
                <p className="mt-2 text-sm text-zinc-300">Announcements will appear here as soon as staff publishes updates.</p>
              </article>
            ) : null}
            <div className="space-y-3">
              {latestNews.map((post) => (
                <article key={post.id} className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5">
                  <h3 className="text-lg font-semibold text-zinc-50">{post.title}</h3>
                  <p className="mt-1 text-xs text-zinc-400">
                    {post.author ? `By ${post.author}` : 'W.A.G.E. Society'} · {new Date(post.created_at).toLocaleString()}
                  </p>
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-zinc-300">{post.body}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

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
        ) : null}

        {dashboardTab === 'settings' ? (
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
                {memberAvatarUrl ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={memberAvatarUrl}
                      alt={getDashboardUsername(member)}
                      className="h-12 w-12 rounded-full border border-zinc-200/20 object-cover"
                    />
                    <p className="text-xs text-zinc-500">
                      Change your photo in{' '}
                      <button
                        type="button"
                        onClick={() => setDashboardTab('settings')}
                        className="text-orange-200 underline hover:text-orange-100"
                      >
                        Profile Settings
                      </button>
                    </p>
                  </div>
                ) : null}
                <div>
                  <p className="text-xs font-medium text-zinc-400">Email</p>
                  <p className="mt-0.5 text-sm text-zinc-100">{member.email || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-400">Username</p>
                  <p className="mt-0.5 text-sm text-zinc-100">{getDashboardUsername(member)}</p>
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
        ) : null}
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
            to="/dashboard"
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
    | 'promotion-hub'
    | 'merch-studio'
    | 'creator-growth-system'
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
