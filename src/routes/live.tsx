import { createFileRoute, Link } from '@tanstack/react-router'
import { ExternalLink, RadioTower, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { authedFetch } from '../lib/supabaseBrowser'

type StreamRow = {
  id: string
  url: string
  title: string | null
  platform: 'twitch' | 'youtube' | 'kick'
  stream_key: string
  created_by: string | null
  created_at: string
  updated_at: string
  status: 'live' | 'offline'
  viewer_count: number | null
  follower_count: number | null
  account_created_at: string | null
}

type LiveApiResponse = {
  requester: {
    email: string
    source: string
  }
  canManage: boolean
  streams: StreamRow[]
}

export const Route = createFileRoute('/live')({
  head: () => ({
    meta: [
      { title: 'Live Streams — W.A.G.E. Society' },
      {
        name: 'description',
        content:
          'View all organization livestreams in one list with live/offline status and quick open links.',
      },
    ],
  }),
  component: LivePage,
})

function LivePage() {
  const [streams, setStreams] = useState<StreamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [canManage, setCanManage] = useState(false)

  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const formatNumber = (value: number | null) => {
    if (value === null || Number.isNaN(value)) return 'Unknown'
    return new Intl.NumberFormat().format(value)
  }

  const loadStreams = async () => {
    try {
      setError('')
      const response = await authedFetch('/api/live/streams')
      const data = (await response.json()) as LiveApiResponse | { error?: string }

      if (!response.ok) {
        setError((data as { error?: string }).error || 'Failed to load livestreams')
        return
      }

      const liveData = data as LiveApiResponse
      setStreams(liveData.streams || [])
      setCanManage(liveData.canManage)
    } catch {
      setError('Failed to load livestreams')
    }
  }

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await loadStreams()
      setLoading(false)
    })()
  }, [])

  const handleAddStream = async (event: React.FormEvent) => {
    event.preventDefault()

    try {
      setSubmitting(true)
      setError('')

      const response = await authedFetch('/api/live/streams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, title }),
      })

      const data = (await response.json()) as { error?: string }

      if (!response.ok) {
        setError(data.error || 'Failed to add livestream')
        return
      }

      setUrl('')
      setTitle('')
      await loadStreams()
    } catch {
      setError('Failed to add livestream')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteStream = async (id: string) => {
    try {
      setError('')

      const response = await authedFetch('/api/live/streams', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id }),
      })

      const data = (await response.json()) as { error?: string }

      if (!response.ok) {
        setError(data.error || 'Failed to remove livestream')
        return
      }

      await loadStreams()
    } catch {
      setError('Failed to remove livestream')
    }
  }

  return (
    <div className="min-h-screen px-4 py-12 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Live Control Center</p>
              <h1 className="mt-2 text-3xl font-black text-zinc-50 md:text-4xl">Organization Livestreams</h1>
              <p className="mt-3 max-w-2xl text-zinc-300">
                Track active streams in one place. Click any stream row to open the channel in a new tab.
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                to="/"
                className="rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100"
              >
                Home
              </Link>
              <Link
                to="/dashboard"
                className="rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100"
              >
                Dashboard
              </Link>
            </div>
          </div>
        </header>

        {canManage ? (
          <section className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
            <h2 className="text-xl font-bold text-zinc-50">Add Livestream Link</h2>
            <p className="mt-2 text-sm text-zinc-300">Admins can add Twitch channel links, YouTube live video links, and Kick channel links.</p>

            <form onSubmit={handleAddStream} className="mt-4 grid gap-3 md:grid-cols-[1.4fr_1fr_auto]">
              <input
                type="url"
                required
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                className="rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                placeholder="https://www.twitch.tv/channel, https://www.youtube.com/watch?v=..., or https://kick.com/channel"
              />
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                placeholder="Optional title"
              />
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-orange-300 px-4 py-2.5 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? 'Adding...' : 'Add Stream'}
              </button>
            </form>
          </section>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>
        ) : null}

        <section className="space-y-3">
          {loading ? <p className="text-zinc-300">Loading livestreams...</p> : null}

          {!loading && streams.length === 0 ? (
            <article className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5 text-zinc-300">
              No livestreams have been added yet.
            </article>
          ) : null}

          {streams.map((stream) => {
            const isLive = stream.status === 'live'

            return (
              <article
                key={stream.id}
                className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5 transition hover:border-orange-300/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <a
                    href={stream.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group block min-w-0 flex-1"
                  >
                    <div className="flex items-center gap-2">
                      <RadioTower size={16} className={isLive ? 'text-rose-300' : 'text-zinc-400'} />
                      <p className="truncate text-lg font-semibold text-zinc-50 group-hover:text-orange-100">
                        {stream.title || `${stream.platform.toUpperCase()} · ${stream.stream_key}`}
                      </p>
                      <ExternalLink size={16} className="text-zinc-400 group-hover:text-orange-200" />
                    </div>
                    <p className="mt-1 truncate text-sm text-zinc-300">{stream.url}</p>
                  </a>

                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                          isLive
                            ? 'border-rose-300/60 bg-rose-500/10 text-rose-200'
                            : 'border-zinc-500/50 bg-zinc-800/40 text-zinc-300'
                        }`}
                      >
                        {isLive ? 'Live' : 'Offline'}
                      </span>

                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => {
                            void handleDeleteStream(stream.id)
                          }}
                          className="rounded-lg border border-zinc-100/25 p-2 text-zinc-200 transition hover:border-rose-300/60 hover:text-rose-200"
                          aria-label="Remove livestream"
                          title="Remove livestream"
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : null}
                    </div>

                    {isLive ? <p className="text-xs text-zinc-300">Viewers: {formatNumber(stream.viewer_count)}</p> : null}
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      </div>
    </div>
  )
}
