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
  }
}

type AccessResponse = {
  role: OrgRole
}

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
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (!params.get('linked')) return
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

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

          <article className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
            <div className="flex items-center gap-3">
              <div className="inline-flex rounded-md border border-zinc-200/20 bg-zinc-950/70 p-2 text-orange-200">
                <CreditCard size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-zinc-50">Subscription</h2>
                <p className="text-xs text-zinc-400">Manage billing and plan changes in one dedicated page</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-zinc-300">
              Subscription upgrades, downgrades, and billing checkout are now handled in the subscriptions center.
            </p>
            <a
              href="/subscriptions"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100"
            >
              Open Subscriptions
            </a>
          </article>
        </div>
      </div>
    </div>
  )
}
