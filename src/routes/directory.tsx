import { createFileRoute, Link } from '@tanstack/react-router'
import { Loader2, Search, UserRound, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { authedFetch, getSupabaseBrowserClient } from '../lib/supabaseBrowser'

type DirectoryEntry = {
  username: string
  displayName: string
  avatarUrl: string | null
  bio: string | null
  connectedCount: number
}

type DirectoryResponse = {
  entries?: DirectoryEntry[]
  error?: string
}

export const Route = createFileRoute('/directory')({
  head: () => ({
    meta: [
      { title: 'Creator Directory — W.A.G.E. Society' },
      {
        name: 'description',
        content: 'Browse all signed-up creators and visit their public W.A.G.E. Society profiles.',
      },
    ],
  }),
  component: DirectoryPage,
})

function DirectoryPage() {
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<DirectoryEntry[]>([])
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    void (async () => {
      setLoading(true)
      setError('')
      try {
        const response = await authedFetch('/api/public-directory?limit=500')
        const data = (await response.json()) as DirectoryResponse

        if (!response.ok) {
          if (!mounted) return
          setError(data.error || 'Could not load creator directory.')
          setEntries([])
          return
        }

        if (!mounted) return
        setEntries(Array.isArray(data.entries) ? data.entries : [])
      } catch {
        if (!mounted) return
        setError('Could not load creator directory.')
        setEntries([])
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

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

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((entry) => {
      const haystack = `${entry.username} ${entry.displayName} ${entry.bio || ''}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [entries, query])

  return (
    <main className="min-h-screen px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-5xl">
        <section className="rounded-3xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                <Users size={13} /> Public Directory
              </p>
              <h1 className="mt-2 text-3xl font-black text-zinc-50">Creator Directory</h1>
              <p className="mt-2 text-sm text-zinc-300">
                Browse all signed-up members and visit their public profiles.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
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

          <div className="mt-6">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">Search</label>
            <div className="flex items-center gap-2 rounded-xl border border-zinc-200/20 bg-zinc-950/60 px-3 py-2">
              <Search size={14} className="text-zinc-500" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by username, display name, or bio"
                className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
              />
            </div>
          </div>

          {loading ? (
            <p className="mt-6 inline-flex items-center gap-2 text-sm text-zinc-300">
              <Loader2 size={14} className="animate-spin" /> Loading members...
            </p>
          ) : error ? (
            <p className="mt-6 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>
          ) : filteredEntries.length === 0 ? (
            <p className="mt-6 rounded-xl border border-zinc-200/15 bg-zinc-950/50 px-4 py-3 text-sm text-zinc-400">
              No members found.
            </p>
          ) : (
            <ul className="mt-6 grid gap-3">
              {filteredEntries.map((entry) => (
                <li key={entry.username}>
                  <Link
                    to="/$username"
                    params={{ username: entry.username }}
                    className="flex items-start gap-3 rounded-2xl border border-zinc-200/15 bg-zinc-950/45 p-4 transition hover:border-orange-200/60 hover:bg-zinc-900/80"
                  >
                    {entry.avatarUrl ? (
                      <img
                        src={entry.avatarUrl}
                        alt={`${entry.displayName} avatar`}
                        className="h-12 w-12 flex-shrink-0 rounded-full border border-zinc-200/20 object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-zinc-200/20 bg-zinc-800">
                        <UserRound size={16} className="text-zinc-500" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-zinc-100">{entry.displayName}</p>
                        <span className="rounded-full border border-zinc-200/20 bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400">
                          @{entry.username}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{entry.bio || 'No bio available yet.'}</p>
                      <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-zinc-500">
                        Connected Accounts: {entry.connectedCount}
                      </p>
                    </div>

                    <span className="rounded-lg border border-zinc-100/25 px-2.5 py-1 text-xs font-semibold text-zinc-200">
                      View Profile
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
