import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ArrowLeft, Bell, CreditCard, Settings } from 'lucide-react'
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

  // Email alert subscription state
  const [liveAlerts, setLiveAlerts] = useState(true)
  const [newsletter, setNewsletter] = useState(true)
  const [productUpdates, setProductUpdates] = useState(false)
  const [communityUpdates, setCommunityUpdates] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [subscribeError, setSubscribeError] = useState('')
  const [subscribeSuccess, setSubscribeSuccess] = useState('')

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

  const handleSubscribe = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubscribeError('')
    setSubscribeSuccess('')

    if (!liveAlerts && !newsletter && !productUpdates && !communityUpdates) {
      setSubscribeError('Choose at least one alert type.')
      return
    }

    try {
      setSubscribing(true)
      const response = await fetch('/api/marketing-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: member?.email?.trim() ?? '',
          liveAlerts,
          newsletter,
          productUpdates,
          communityUpdates,
          source: 'settings',
        }),
      })

      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        setSubscribeError(data.error || 'Could not update preferences right now.')
        return
      }

      setSubscribeSuccess('Preferences saved. You will receive the alerts you selected.')
    } catch {
      setSubscribeError('Could not update preferences right now.')
    } finally {
      setSubscribing(false)
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

        <article className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-md border border-zinc-200/20 bg-zinc-950/70 p-2 text-orange-200">
              <Bell size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-50">Email Alerts</h2>
              <p className="text-xs text-zinc-400">Choose what you want to hear about</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-zinc-300">
            Alerts will be sent to <span className="font-medium text-zinc-100">{member.email}</span>. Update your selections anytime.
          </p>
          <form onSubmit={(e) => { void handleSubscribe(e) }} className="mt-4 space-y-3">
            <div className="grid gap-2 text-sm text-zinc-300 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200/15 bg-zinc-950/40 px-3 py-2 transition hover:border-orange-200/30">
                <input type="checkbox" checked={liveAlerts} onChange={(e) => setLiveAlerts(e.target.checked)} className="accent-orange-300" />
                Live alerts
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200/15 bg-zinc-950/40 px-3 py-2 transition hover:border-orange-200/30">
                <input type="checkbox" checked={newsletter} onChange={(e) => setNewsletter(e.target.checked)} className="accent-orange-300" />
                Newsletter
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200/15 bg-zinc-950/40 px-3 py-2 transition hover:border-orange-200/30">
                <input type="checkbox" checked={productUpdates} onChange={(e) => setProductUpdates(e.target.checked)} className="accent-orange-300" />
                Product updates
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200/15 bg-zinc-950/40 px-3 py-2 transition hover:border-orange-200/30">
                <input type="checkbox" checked={communityUpdates} onChange={(e) => setCommunityUpdates(e.target.checked)} className="accent-orange-300" />
                Community updates
              </label>
            </div>
            {subscribeError ? <p className="text-xs text-rose-300">{subscribeError}</p> : null}
            {subscribeSuccess ? <p className="text-xs text-emerald-300">{subscribeSuccess}</p> : null}
            <button
              type="submit"
              disabled={subscribing}
              className="rounded-lg bg-orange-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70"
            >
              {subscribing ? 'Saving...' : 'Save Preferences'}
            </button>
          </form>
        </article>
      </div>
    </div>
  )
}
