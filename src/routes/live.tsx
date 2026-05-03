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
  canUseAutoclipper: boolean
  streams: StreamRow[]
}

type AutoclipperJob = {
  id: string
  status: 'queued' | 'processing' | 'ready' | 'posted' | 'failed'
  command: string
  source: string
  requestedBy: string
  clipWindowMinutes: number
  streamPlatform: string | null
  streamKey: string | null
  autoPost: boolean
  autoCaption: boolean
  platforms: string[]
  caption: string
  clipUrl: string | null
  queuedPostId: string | null
  createdAt: string
  updatedAt: string
}

type AutoclipperApiResponse = {
  jobs: AutoclipperJob[]
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
  const [canUseAutoclipper, setCanUseAutoclipper] = useState(false)

  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [autoJobs, setAutoJobs] = useState<AutoclipperJob[]>([])
  const [autoLoading, setAutoLoading] = useState(true)
  const [autoBusy, setAutoBusy] = useState(false)
  const [updatingJobId, setUpdatingJobId] = useState<string | null>(null)

  const formatNumber = (value: number | null) => {
    if (value === null || Number.isNaN(value)) return 'Unknown'
    return new Intl.NumberFormat().format(value)
  }

  const formatStreamLabel = (stream: StreamRow) => {
    if (stream.title) return stream.title

    if (stream.platform !== 'youtube') {
      return `${stream.platform.toUpperCase()} · ${stream.stream_key}`
    }

    if (stream.stream_key.startsWith('handle:')) {
      return `YOUTUBE · ${stream.stream_key.slice('handle:'.length)}`
    }

    if (stream.stream_key.startsWith('channel:')) {
      return `YOUTUBE · Channel ${stream.stream_key.slice('channel:'.length)}`
    }

    if (stream.stream_key.startsWith('user:')) {
      return `YOUTUBE · ${stream.stream_key.slice('user:'.length)}`
    }

    if (stream.stream_key.startsWith('custom:')) {
      return `YOUTUBE · ${stream.stream_key.slice('custom:'.length)}`
    }

    return `YOUTUBE · ${stream.stream_key}`
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
      setCanUseAutoclipper(Boolean(liveData.canUseAutoclipper))
      return Boolean(liveData.canUseAutoclipper)
    } catch {
      setError('Failed to load livestreams')
      return false
    }
  }

  const loadAutoclipperJobs = async () => {
    try {
      const response = await authedFetch('/api/live/clips')
      const data = (await response.json()) as AutoclipperApiResponse | { error?: string }
      if (!response.ok) {
        setError((data as { error?: string }).error || 'Failed to load autoclipper queue')
        return
      }
      setAutoJobs((data as AutoclipperApiResponse).jobs || [])
    } catch {
      setError('Failed to load autoclipper queue')
    } finally {
      setAutoLoading(false)
    }
  }

  useEffect(() => {
    void (async () => {
      setLoading(true)
      const hasAutoclipperAccess = await loadStreams()
      if (hasAutoclipperAccess) {
        await loadAutoclipperJobs()
      } else {
        setAutoJobs([])
        setAutoLoading(false)
      }
      setLoading(false)
    })()
  }, [])

  const triggerAutoclip = async () => {
    try {
      setAutoBusy(true)
      setError('')
      const response = await authedFetch('/api/live/clips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commandText: '!clip',
          autoPost: true,
          autoCaption: true,
          platforms: ['x', 'kick', 'instagram'],
          clipWindowMinutes: 5,
        }),
      })

      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        setError(data.error || 'Failed to trigger autoclip')
        return
      }

      await loadAutoclipperJobs()
    } catch {
      setError('Failed to trigger autoclip')
    } finally {
      setAutoBusy(false)
    }
  }

  const updateAutoclipStatus = async (id: string, status: AutoclipperJob['status']) => {
    try {
      setUpdatingJobId(id)
      setError('')
      const response = await authedFetch('/api/live/clips', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id,
          status,
        }),
      })

      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        setError(data.error || 'Failed to update clip status')
        return
      }

      await loadAutoclipperJobs()
    } catch {
      setError('Failed to update clip status')
    } finally {
      setUpdatingJobId(null)
    }
  }

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
        body: JSON.stringify({ url }),
      })

      const data = (await response.json()) as { error?: string }

      if (!response.ok) {
        setError(data.error || 'Failed to add livestream')
        return
      }

      setUrl('')
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
                to="/dashboard"
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
            <p className="mt-2 text-sm text-zinc-300">Admins can add Twitch channel links, YouTube channel links, and Kick channel links.</p>

            <form onSubmit={handleAddStream} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
              <label className="flex flex-col gap-2 text-sm text-zinc-300">
                <span>Livestream URL</span>
                <input
                  type="url"
                  required
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  className="rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                  placeholder="https://www.twitch.tv/channel, https://www.youtube.com/@channel, or https://kick.com/channel"
                />
              </label>
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

        {canUseAutoclipper ? (
          <section className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-zinc-50">Autoclipper</h2>
              <p className="mt-2 text-sm text-zinc-300">
                Chat users run <span className="font-semibold text-orange-200">!clip</span> and the bot auto-creates a 5-minute clip job, auto-captions it, and auto-queues social posts.
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                Discord/chat bot integration endpoint: /api/live/clips (header x-autoclipper-secret required).
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void triggerAutoclip()
              }}
              disabled={autoBusy}
              className="rounded-lg bg-orange-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {autoBusy ? 'Triggering...' : 'Trigger !clip (Test)'}
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-zinc-200/10 bg-zinc-950/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Clip Queue</p>
            {autoLoading ? (
              <p className="mt-2 text-sm text-zinc-400">Loading clip jobs...</p>
            ) : autoJobs.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No clip jobs yet. Send !clip in chat or click Trigger !clip.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {autoJobs.map((job) => (
                  <div key={job.id} className="rounded-lg border border-zinc-200/10 bg-zinc-900/50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-zinc-100">{job.command} • {job.clipWindowMinutes}m • {job.source}</p>
                        <p className="text-xs text-zinc-400">
                          By {job.requestedBy} · Platforms: {job.platforms.join(', ') || 'none'}
                        </p>
                        {job.caption ? <p className="mt-1 text-xs text-zinc-300">{job.caption}</p> : null}
                        {job.queuedPostId ? <p className="mt-1 text-[11px] text-emerald-300">Queued for social posting.</p> : null}
                        {job.clipUrl ? (
                          <a href={String(job.clipUrl)} target="_blank" rel="noreferrer" className="mt-1 inline-flex text-xs text-orange-200 hover:text-orange-100">
                            Open clip URL
                          </a>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          job.status === 'posted'
                            ? 'bg-emerald-300/10 text-emerald-300'
                            : job.status === 'failed'
                            ? 'bg-rose-300/10 text-rose-300'
                            : job.status === 'ready'
                            ? 'bg-sky-300/10 text-sky-300'
                            : 'bg-zinc-200/10 text-zinc-400'
                        }`}>{job.status}</span>

                        {canManage ? (
                          <select
                            value={job.status}
                            onChange={(event) => {
                              void updateAutoclipStatus(job.id, event.target.value as AutoclipperJob['status'])
                            }}
                            disabled={updatingJobId === job.id}
                            className="rounded-md border border-zinc-200/20 bg-zinc-950/70 px-2 py-1 text-xs text-zinc-100 outline-none"
                          >
                            <option value="queued">queued</option>
                            <option value="processing">processing</option>
                            <option value="ready">ready</option>
                            <option value="posted">posted</option>
                            <option value="failed">failed</option>
                          </select>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </section>
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
                        {formatStreamLabel(stream)}
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
