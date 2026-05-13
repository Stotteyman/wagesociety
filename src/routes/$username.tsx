import { createFileRoute, Link } from '@tanstack/react-router'
import { ExternalLink, Loader2, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getSupabaseBrowserClient } from '../lib/supabaseBrowser'

type PublicConnectedAccount = {
  provider: string
  providerLabel: string
  handle: string | null
  url: string | null
}

type PublicProfile = {
  username: string
  displayName: string
  avatarUrl: string | null
  bio: string | null
  skills: string[]
  connectedAccounts: PublicConnectedAccount[]
  updatedAt: string | null
}

type PublicProfileResponse = {
  profile?: PublicProfile
  error?: string
}

export const Route = createFileRoute('/$username')({
  head: () => ({
    meta: [
      { title: 'Creator Profile — W.A.G.E. Society' },
      {
        name: 'description',
        content: 'Public creator profile on W.A.G.E. Society with connected accounts, bio, and creator details.',
      },
    ],
  }),
  component: PublicProfilePage,
})

function PublicProfilePage() {
  const { username } = Route.useParams()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [error, setError] = useState('')
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    void (async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/public-profile?username=${encodeURIComponent(username)}`)
        const data = (await response.json()) as PublicProfileResponse

        if (!response.ok || !data.profile) {
          if (!mounted) return
          setProfile(null)
          setError(data.error || 'Profile not found.')
          return
        }

        if (!mounted) return
        setProfile(data.profile)
      } catch {
        if (!mounted) return
        setProfile(null)
        setError('Could not load profile right now.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [username])

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    const checkAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        setUser(data.session?.user || null)
      } catch {
        setUser(null)
      } finally {
        setAuthLoading(false)
      }
    }

    void checkAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
      setAuthLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const connectedCount = useMemo(() => profile?.connectedAccounts.length || 0, [profile?.connectedAccounts])

  if (loading) {
    return (
      <main className="min-h-screen px-4 py-16 text-zinc-100">
        <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8">
          <p className="inline-flex items-center gap-2 text-sm text-zinc-300">
            <Loader2 size={14} className="animate-spin" /> Loading creator profile...
          </p>
        </div>
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="min-h-screen px-4 py-16 text-zinc-100">
        <div className="mx-auto max-w-3xl rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8 text-center">
          <h1 className="text-3xl font-black text-zinc-50">Profile Not Found</h1>
          <p className="mt-3 text-sm text-zinc-300">{error || 'This profile may not exist yet.'}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              to="/"
              className="rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70"
            >
              Home
            </Link>
            {!authLoading && (
              user ? (
                <Link
                  to="/dashboard"
                  className="rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200"
                >
                  Dashboard
                </Link>
              ) : (
                <Link
                  to="/signup"
                  className="rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200"
                >
                  Join W.A.G.E.
                </Link>
              )
            )}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-5xl">
        <section className="rounded-3xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-4">
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={`${profile.displayName} avatar`}
                  className="h-20 w-20 rounded-full border border-zinc-200/20 object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-zinc-200/20 bg-zinc-800">
                  <UserRound size={26} className="text-zinc-400" />
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Creator Profile</p>
                <h1 className="mt-1 text-3xl font-black text-zinc-50">{profile.displayName}</h1>
                <p className="mt-1 text-sm text-orange-200">@{profile.username}</p>
                <p className="mt-2 text-sm text-zinc-300">
                  Connected Accounts: <span className="font-semibold text-zinc-100">{connectedCount}</span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!authLoading && (
                user ? (
                  <Link
                    to="/dashboard"
                    className="rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200"
                  >
                    Dashboard
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/signup"
                      className="rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200"
                    >
                      Join / Connect
                    </Link>
                    <Link
                      to="/login"
                      className="rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70"
                    >
                      Log In
                    </Link>
                  </>
                )
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-[1.15fr_0.85fr]">
            <article className="rounded-2xl border border-zinc-200/15 bg-zinc-950/50 p-5">
              <h2 className="text-lg font-bold text-zinc-50">Bio</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-300">
                {profile.bio || 'This creator has not added a bio yet.'}
              </p>

              <h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">Skills</h3>
              {profile.skills.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {profile.skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full border border-zinc-200/20 bg-zinc-900 px-3 py-1 text-xs text-zinc-200"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">No skills listed yet.</p>
              )}
            </article>

            <article className="rounded-2xl border border-zinc-200/15 bg-zinc-950/50 p-5">
              <h2 className="text-lg font-bold text-zinc-50">Connected Accounts</h2>
              {profile.connectedAccounts.length ? (
                <ul className="mt-3 space-y-2">
                  {profile.connectedAccounts.map((account) => (
                    <li
                      key={`${account.provider}-${account.handle || account.providerLabel}`}
                      className="rounded-xl border border-zinc-200/15 bg-zinc-900/70 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-100">{account.providerLabel}</p>
                          <p className="text-xs text-zinc-400">{account.handle ? `@${account.handle.replace(/^@/, '')}` : 'Connected'}</p>
                        </div>
                        {account.url ? (
                          <a
                            href={account.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-100/20 px-2.5 py-1 text-xs font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100"
                          >
                            Open <ExternalLink size={12} />
                          </a>
                        ) : (
                          <span className="text-xs text-zinc-500">No public URL</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">No connected accounts are public yet.</p>
              )}
            </article>
          </div>
        </section>
      </div>
    </main>
  )
}
