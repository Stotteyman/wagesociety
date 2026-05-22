import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { ArrowRight, LogIn, LogOut, Newspaper, Store, Tv, User, UserPlus, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
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
      { property: 'og:url', content: 'https://wagesociety.com/' },
    ],
    links: [{ rel: 'canonical', href: 'https://wagesociety.com/' }],
  }),
  component: Home,
})

const publicDestinations = [
  {
    title: 'Shop',
    description: 'Pick up exclusive W.A.G.E. Society merch and explore membership tiers built for creators at every stage.',
    to: '/merch' as const,
    icon: Store,
  },
  {
    title: 'Livestream',
    description: 'Catch members live across platforms — see who\'s streaming and what they\'re building right now.',
    to: '/live' as const,
    icon: Tv,
  },
  {
    title: 'Directory',
    description: 'Browse our growing network of creators, marketers, and entrepreneurs — find collaborators and supporters.',
    to: '/directory' as const,
    icon: Users,
  },
  {
    title: 'Blog',
    description: 'Get org news, creator spotlights, strategy breakdowns, and announcements straight from the team.',
    to: '/news' as const,
    icon: Newspaper,
  },
]

function Home() {
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return

    const search = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const hasAuthCallbackPayload = Boolean(
      search.get('code') ||
      hash.get('access_token') ||
      hash.get('refresh_token') ||
      search.get('linked'),
    )

    if (hasAuthCallbackPayload) {
      const query = window.location.search || ''
      const hashFragment = window.location.hash || ''
      window.location.replace(`/auth/callback${query}${hashFragment}`)
      return
    }

    const error = search.get('error') || hash.get('error')
    const errorDescription = search.get('error_description') || hash.get('error_description')

    if (!error && !errorDescription) return

    const params = new URLSearchParams()
    if (error) params.set('error', error)
    if (errorDescription) params.set('error_description', errorDescription)

    window.location.replace(`/login?${params.toString()}`)
  }, [])

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data } = await supabase.auth.getSession()
        setUser(data.session?.user || null)
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

  return (
    <>
      <section className="mt-8 rounded-3xl border border-orange-200/20 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-6 sm:p-8 lg:p-10">
          <p className="inline-flex rounded-full border border-orange-300/30 bg-orange-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-orange-100">
            Creator Growth Organization
          </p>
          <h1 className="mt-4 max-w-3xl text-3xl font-black leading-tight text-zinc-50 sm:text-4xl lg:text-5xl">
            Built for creators who mean business.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-300 sm:text-base">
            W.A.G.E. Society is a creator-first organization built around live streaming, community, and execution. Explore the directory, watch members live, grab merch, and — when you\'re ready — join the org and plug into the full creator operating system.
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
          <div className="mt-8">
            <img
              src="/hero-graphic.svg"
              alt="W.A.G.E. Society hero graphic"
              className="w-full rounded-2xl border border-zinc-800/30 shadow-2xl"
            />
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


    </>
  )
}
