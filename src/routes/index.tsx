import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { ArrowRight, LogIn, LogOut, Newspaper, Store, Tv, User, UserPlus, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getLocalRootUser, isLocalRootSessionActive } from '../lib/localRootSession'
import { getSupabaseBrowserClient } from '../lib/supabaseBrowser'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'W.A.G.E. Society — Creator Growth Organization' },
      {
        name: 'description',
        content:
          'Join W.A.G.E. Society, an organization for content creators, online marketers, and entrepreneurs building modern digital businesses together.',
      },
      { property: 'og:title', content: 'W.A.G.E. Society — Creator Growth Organization' },
      {
        property: 'og:description',
        content:
          'An organization for content creators, online marketers, and entrepreneurs who want tools, strategy, and community to grow.',
      },
      { property: 'og:url', content: 'https://playful-torte-0c9af1.netlify.app/' },
    ],
    links: [{ rel: 'canonical', href: 'https://playful-torte-0c9af1.netlify.app/' }],
  }),
  component: Home,
})

const publicDestinations = [
  {
    title: 'Shop',
    description: 'Browse memberships and merch available to all visitors.',
    to: '/merch' as const,
    icon: Store,
  },
  {
    title: 'Livestream',
    description: 'View the live section and stream activity feed.',
    to: '/live' as const,
    icon: Tv,
  },
  {
    title: 'Directory',
    description: 'Discover creators and open their public profiles.',
    to: '/directory' as const,
    icon: Users,
  },
  {
    title: 'Blog',
    description: 'Read public updates, announcements, and posts.',
    to: '/news' as const,
    icon: Newspaper,
  },
]

function Home() {
  const [email, setEmail] = useState('')
  const [liveAlerts, setLiveAlerts] = useState(true)
  const [newsletter, setNewsletter] = useState(true)
  const [productUpdates, setProductUpdates] = useState(false)
  const [communityUpdates, setCommunityUpdates] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [subscribeError, setSubscribeError] = useState('')
  const [subscribeSuccess, setSubscribeSuccess] = useState('')
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      // Check local root session first (dev bypass)
      if (isLocalRootSessionActive()) {
        const localUser = getLocalRootUser()
        setUser(localUser)
        setEmail(localUser.email)
        setAuthLoading(false)
        return
      }

      try {
        const supabase = getSupabaseBrowserClient()
        const { data } = await supabase.auth.getSession()
        setUser(data.session?.user || null)
        if (data.session?.user?.email) {
          setEmail(data.session.user.email)
        }
      } catch {
        setUser(null)
      } finally {
        setAuthLoading(false)
      }
    }

    checkAuth()
  }, [])

  const handleLogout = async () => {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    setUser(null)
    await router.navigate({ to: '/' })
  }

  const handleSubscribe = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubscribeError('')
    setSubscribeSuccess('')

    if (!email.trim()) {
      setSubscribeError('Please enter an email address.')
      return
    }

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
          email: email.trim(),
          liveAlerts,
          newsletter,
          productUpdates,
          communityUpdates,
          source: 'homepage',
        }),
      })

      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        setSubscribeError(data.error || 'Could not subscribe right now.')
        return
      }

      setSubscribeSuccess('Subscribed. You will receive the alerts you selected.')
      setEmail('')
    } catch {
      setSubscribeError('Could not subscribe right now.')
    } finally {
      setSubscribing(false)
    }
  }

  return (
    <>
      <section className="mt-8 rounded-3xl border border-orange-200/20 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-6 sm:p-8 lg:p-10">
          <p className="inline-flex rounded-full border border-orange-300/30 bg-orange-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-orange-100">
            Public Portal
          </p>
          <h1 className="mt-4 max-w-3xl text-3xl font-black leading-tight text-zinc-50 sm:text-4xl lg:text-5xl">
            One place for creators to connect, watch live, discover members, and grow.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-300 sm:text-base">
            Whether visitors are authenticated or not, they can access public sections, explore creators, and jump into the content that matters most.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {!authLoading && user ? (
              <>
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-2 rounded-xl bg-orange-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200"
                >
                  <User size={15} /> Profile
                </Link>
                <button
                  type="button"
                  onClick={() => { void handleLogout() }}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-100/25 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/60"
                >
                  <LogOut size={15} /> Logout
                </button>
              </>
            ) : !authLoading ? (
              <>
                <Link
                  to="/signup"
                  className="inline-flex items-center gap-2 rounded-xl bg-orange-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200"
                >
                  <UserPlus size={15} /> Create Account
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-100/25 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/60"
                >
                  <LogIn size={15} /> Login
                </Link>
              </>
            ) : null}
          </div>
        </section>

        <section className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {publicDestinations.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.to}
                to={item.to}
                className="group rounded-2xl border border-zinc-200/15 bg-zinc-900/70 p-5 transition hover:border-orange-200/55 hover:bg-zinc-900"
              >
                <span className="inline-flex rounded-lg border border-zinc-100/15 bg-zinc-800/80 p-2 text-orange-200">
                  <Icon size={16} />
                </span>
                <h2 className="mt-4 text-lg font-bold text-zinc-50">{item.title}</h2>
                <p className="mt-2 text-sm text-zinc-400">{item.description}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-orange-100">
                  Open <ArrowRight size={13} className="transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            )
          })}
        </section>

        {!authLoading && user && (
          <section className="mt-7 rounded-2xl border border-zinc-200/15 bg-zinc-900/70 p-5 sm:p-6">
            <h2 className="text-lg font-bold text-zinc-50">Get Email Alerts</h2>
            <p className="mt-1 text-sm text-zinc-400">Subscribe for live alerts, newsletters, and website updates.</p>

            <form onSubmit={handleSubscribe} className="mt-4 space-y-3">
              <input
                type="email"
                value={email}
                readOnly
                className="w-full rounded-lg border border-zinc-200/20 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-300 outline-none"
              />

              <div className="grid gap-2 text-sm text-zinc-300 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={liveAlerts} onChange={(event) => setLiveAlerts(event.target.checked)} />
                  Live alerts
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={newsletter} onChange={(event) => setNewsletter(event.target.checked)} />
                  Newsletter
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={productUpdates} onChange={(event) => setProductUpdates(event.target.checked)} />
                  Product updates
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={communityUpdates} onChange={(event) => setCommunityUpdates(event.target.checked)} />
                  Community updates
                </label>
              </div>

              {subscribeError ? <p className="text-xs text-rose-300">{subscribeError}</p> : null}
              {subscribeSuccess ? <p className="text-xs text-emerald-300">{subscribeSuccess}</p> : null}

              <button
                type="submit"
                disabled={subscribing}
                className="w-full rounded-lg bg-orange-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70 sm:w-auto"
              >
                {subscribing ? 'Subscribing...' : 'Subscribe'}
              </button>
            </form>
          </section>
        )}
    </>
  )
}
