import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { ArrowLeft, BookOpen, ExternalLink, Eye, FileText, GraduationCap, LayoutTemplate, Plus, Save, Search, Tag, TrendingUp, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { authedFetch } from '../lib/supabaseBrowser'
import { CollaborationHub } from '../components/CollaborationHub'

const toolSchema = z.enum([
  'bulletin-board',
  'content-calendar',
  'revenue-tracker',
  'creator-task-board',
  'collaboration-hub',
  'knowledge-vault',
])

type ToolKey = z.infer<typeof toolSchema>
type EntryStatus = 'idea' | 'planned' | 'active' | 'blocked' | 'done'

type ToolEntry = {
  id: string
  tool_key: ToolKey
  title: string
  details: string
  status: EntryStatus
  event_date: string | null
  amount_cents: number | null
  metadata: Record<string, unknown>
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

type ToolApiResponse = {
  tool: ToolKey
  entries: ToolEntry[]
}

type ToolConfig = {
  key: ToolKey
  title: string
  description: string
  helper: string
  showDate: boolean
  showAmount: boolean
}

const TOOL_CONFIGS: Record<ToolKey, ToolConfig> = {
  'bulletin-board': {
    key: 'bulletin-board',
    title: 'Bulletin Board',
    description: 'Post important announcements, launches, and opportunities for your team.',
    helper: 'Use short headlines and clear action items so everyone can execute quickly.',
    showDate: false,
    showAmount: false,
  },
  'content-calendar': {
    key: 'content-calendar',
    title: 'Content Calendar',
    description: 'Plan and track content outputs across platforms and campaigns.',
    helper: 'Set a date for each item and move status from planned to done as you ship.',
    showDate: true,
    showAmount: false,
  },
  'revenue-tracker': {
    key: 'revenue-tracker',
    title: 'Revenue Tracker',
    description: 'Track revenue-related entries and outcomes over time.',
    helper: 'Enter amount values in dollars to keep a clear running record of outcomes.',
    showDate: true,
    showAmount: true,
  },
  'creator-task-board': {
    key: 'creator-task-board',
    title: 'Creator Task Board',
    description: 'Manage weekly execution tasks and unblock momentum.',
    helper: 'Keep tasks specific and outcome-focused; update status as work progresses.',
    showDate: true,
    showAmount: false,
  },
  'collaboration-hub': {
    key: 'collaboration-hub',
    title: 'Collaboration Hub',
    description: 'Track partner initiatives, co-marketing plans, and shared deliverables.',
    helper: 'Document ownership and next actions for each collaboration.',
    showDate: true,
    showAmount: false,
  },
  'knowledge-vault': {
    key: 'knowledge-vault',
    title: 'Knowledge Vault',
    description: 'Store reusable frameworks, scripts, templates, and strategic notes.',
    helper: 'Capture proven patterns so you can reuse what works.',
    showDate: false,
    showAmount: false,
  },
}

const statusOptions: EntryStatus[] = ['idea', 'planned', 'active', 'blocked', 'done']

export const Route = createFileRoute('/dashboard/tools/$tool')({
  component: DashboardToolPage,
  beforeLoad: ({ params }) => {
    const parsed = toolSchema.safeParse(params.tool)
    if (!parsed.success) {
      throw notFound()
    }
  },
})

function DashboardToolPage() {
  const params = Route.useParams()
  const parsedTool = toolSchema.safeParse(params.tool)
  if (!parsedTool.success) {
    throw notFound()
  }

  const toolKey = parsedTool.data

  // Knowledge Vault has its own dedicated library UI
  if (toolKey === 'knowledge-vault') {
    return <KnowledgeVaultPage />
  }

  // Revenue Tracker has a personalized member UI
  if (toolKey === 'revenue-tracker') {
    return <RevenueTrackerPage />
  }

    // Collaboration Hub has its own full UI
    if (toolKey === 'collaboration-hub') {
      return <CollaborationHub />
    }

  const config = TOOL_CONFIGS[toolKey]

  const [entries, setEntries] = useState<ToolEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [status, setStatus] = useState<EntryStatus>('planned')
  const [eventDate, setEventDate] = useState('')
  const [amount, setAmount] = useState('')

  const createPayload = useMemo(
    () => ({
      title: title.trim(),
      details: details.trim(),
      status,
      eventDate: eventDate ? new Date(eventDate).toISOString() : null,
      amountCents: config.showAmount && amount ? Math.max(0, Math.round(Number(amount) * 100)) : null,
    }),
    [title, details, status, eventDate, amount, config.showAmount]
  )

  const loadEntries = async () => {
    setError('')
    const response = await authedFetch(`/api/tools/${toolKey}`)
    const data = (await response.json()) as ToolApiResponse | { error?: string }

    if (!response.ok) {
      setError((data as { error?: string }).error || 'Failed to load tool entries.')
      return
    }

    setEntries((data as ToolApiResponse).entries || [])
  }

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true)
        await loadEntries()
      } catch {
        setError('Failed to load tool entries.')
      } finally {
        setLoading(false)
      }
    })()
  }, [toolKey])

  const createEntry = async () => {
    if (!createPayload.title) {
      setError('Title is required.')
      return
    }

    try {
      setError('')
      setBusyId('new')

      const response = await authedFetch(`/api/tools/${toolKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload),
      })
      const data = (await response.json()) as { error?: string }

      if (!response.ok) {
        setError(data.error || 'Could not create entry.')
        return
      }

      setTitle('')
      setDetails('')
      setStatus('planned')
      setEventDate('')
      setAmount('')
      await loadEntries()
    } catch {
      setError('Could not create entry.')
    } finally {
      setBusyId(null)
    }
  }

  const updateEntry = async (entry: ToolEntry) => {
    try {
      setError('')
      setBusyId(entry.id)

      const response = await authedFetch(`/api/tools/${toolKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entry.id,
          title: entry.title,
          details: entry.details,
          status: entry.status,
          eventDate: entry.event_date,
          amountCents: entry.amount_cents,
          metadata: entry.metadata,
        }),
      })

      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        setError(data.error || 'Could not update entry.')
        return
      }

      await loadEntries()
    } catch {
      setError('Could not update entry.')
    } finally {
      setBusyId(null)
    }
  }

  const deleteEntry = async (id: string) => {
    try {
      setError('')
      setBusyId(id)

      const response = await authedFetch(`/api/tools/${toolKey}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })

      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        setError(data.error || 'Could not delete entry.')
        return
      }

      await loadEntries()
    } catch {
      setError('Could not delete entry.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-screen px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Dashboard Tool</p>
              <h1 className="mt-2 text-3xl font-black text-zinc-50">{config.title}</h1>
              <p className="mt-2 max-w-3xl text-sm text-zinc-300">{config.description}</p>
              <p className="mt-2 text-xs text-zinc-400">{config.helper}</p>
            </div>
            <div className="flex gap-3">
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100"
              >
                <ArrowLeft size={16} /> Dashboard
              </Link>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
          <h2 className="text-xl font-semibold text-zinc-50">Add Entry</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Entry title"
              className="rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
            />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as EntryStatus)}
              className="rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {config.showDate ? (
              <input
                type="datetime-local"
                value={eventDate}
                onChange={(event) => setEventDate(event.target.value)}
                className="rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
              />
            ) : null}
            {config.showAmount ? (
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="Amount (USD)"
                className="rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
              />
            ) : null}
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Details"
              rows={4}
              className="md:col-span-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              void createEntry()
            }}
            disabled={busyId === 'new'}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-300 px-4 py-2 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Plus size={16} /> {busyId === 'new' ? 'Adding...' : 'Add Entry'}
          </button>
        </section>

        {error ? (
          <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>
        ) : null}

        <section className="space-y-3">
          {loading ? <p className="text-zinc-300">Loading entries...</p> : null}

          {!loading && entries.length === 0 ? (
            <article className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5 text-zinc-300">
              No entries yet for this tool.
            </article>
          ) : null}

          {entries.map((entry) => (
            <article key={entry.id} className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  type="text"
                  value={entry.title}
                  onChange={(event) => {
                    setEntries((current) =>
                      current.map((item) =>
                        item.id === entry.id
                          ? {
                              ...item,
                              title: event.target.value,
                            }
                          : item
                      )
                    )
                  }}
                  className="rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                />
                <select
                  value={entry.status}
                  onChange={(event) => {
                    setEntries((current) =>
                      current.map((item) =>
                        item.id === entry.id
                          ? {
                              ...item,
                              status: event.target.value as EntryStatus,
                            }
                          : item
                      )
                    )
                  }}
                  className="rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                >
                  {statusOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {config.showDate ? (
                  <input
                    type="datetime-local"
                    value={entry.event_date ? new Date(entry.event_date).toISOString().slice(0, 16) : ''}
                    onChange={(event) => {
                      setEntries((current) =>
                        current.map((item) =>
                          item.id === entry.id
                            ? {
                                ...item,
                                event_date: event.target.value ? new Date(event.target.value).toISOString() : null,
                              }
                            : item
                        )
                      )
                    }}
                    className="rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                  />
                ) : null}
                {config.showAmount ? (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={entry.amount_cents === null ? '' : (entry.amount_cents / 100).toString()}
                    onChange={(event) => {
                      setEntries((current) =>
                        current.map((item) =>
                          item.id === entry.id
                            ? {
                                ...item,
                                amount_cents: event.target.value ? Math.max(0, Math.round(Number(event.target.value) * 100)) : null,
                              }
                            : item
                        )
                      )
                    }}
                    className="rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                  />
                ) : null}
                <textarea
                  rows={3}
                  value={entry.details}
                  onChange={(event) => {
                    setEntries((current) =>
                      current.map((item) =>
                        item.id === entry.id
                          ? {
                              ...item,
                              details: event.target.value,
                            }
                          : item
                      )
                    )
                  }}
                  className="md:col-span-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-400">Updated {new Date(entry.updated_at).toLocaleString()}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void updateEntry(entry)
                    }}
                    disabled={busyId === entry.id}
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-100/25 px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <Save size={14} /> Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void deleteEntry(entry.id)
                    }}
                    disabled={busyId === entry.id}
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-300/30 px-3 py-2 text-sm font-semibold text-rose-200 transition hover:border-rose-200 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  )
}

// ─── Revenue Tracker ──────────────────────────────────────────────────────────

type RevenueVenue =
  | 'youtube'
  | 'tiktok'
  | 'newsletter'
  | 'course'
  | 'coaching'
  | 'merch'
  | 'affiliate'
  | 'membership'
  | 'freelance'
  | 'events'
  | 'other'

const VENUE_LABELS: Record<RevenueVenue, string> = {
  youtube: 'YouTube / Video',
  tiktok: 'TikTok / Reels',
  newsletter: 'Newsletter / Email',
  course: 'Digital Products',
  coaching: 'Coaching / Consulting',
  merch: 'Merch / Physical',
  affiliate: 'Affiliate / Referral',
  membership: 'Memberships',
  freelance: 'Freelance / Services',
  events: 'Events / Live',
  other: 'Other',
}

const VENUE_COLORS: Record<RevenueVenue, string> = {
  youtube: '#ef4444',
  tiktok: '#ec4899',
  newsletter: '#f97316',
  course: '#8b5cf6',
  coaching: '#06b6d4',
  merch: '#10b981',
  affiliate: '#f59e0b',
  membership: '#6366f1',
  freelance: '#84cc16',
  events: '#14b8a6',
  other: '#9ca3af',
}

type RevenueEntry = {
  id: string
  title: string
  details: string
  amount_cents: number | null
  event_date: string | null
  status: EntryStatus
  venue: RevenueVenue
  created_at: string
  updated_at: string
}

function parseRevenueEntry(entry: ToolEntry): RevenueEntry {
  return {
    id: entry.id,
    title: entry.title,
    details: entry.details,
    amount_cents: entry.amount_cents,
    event_date: entry.event_date,
    status: entry.status,
    venue: ((entry.metadata?.venue as string) || 'other') as RevenueVenue,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
  }
}

function formatCents(cents: number | null): string {
  if (cents === null || cents === 0) return '$0'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(cents / 100)
}

function AnimatedNumber({ value, prefix = '' }: { value: number; prefix?: string }) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (value === 0) { setDisplay(0); return }
    const start = Date.now()
    const duration = 900
    const from = 0
    const raf = (id: number) => id
    let handle = raf(0)

    const step = () => {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(from + (value - from) * eased))
      if (progress < 1) {
        handle = requestAnimationFrame(step)
      }
    }
    handle = requestAnimationFrame(step)
    return () => cancelAnimationFrame(handle)
  }, [value])

  return <span>{prefix}{display.toLocaleString()}</span>
}

function VenueBar({ label, cents, maxCents, color }: { label: string; cents: number; maxCents: number; color: string }) {
  const pct = maxCents > 0 ? (cents / maxCents) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 truncate text-xs text-zinc-400">{label}</span>
      <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-20 shrink-0 text-right text-xs font-semibold text-zinc-200">{formatCents(cents)}</span>
    </div>
  )
}

function RevenueTrackerPage() {
  const [entries, setEntries] = useState<RevenueEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [filterVenue, setFilterVenue] = useState<RevenueVenue | 'all'>('all')

  // Add form
  const [addTitle, setAddTitle] = useState('')
  const [addDetails, setAddDetails] = useState('')
  const [addAmount, setAddAmount] = useState('')
  const [addVenue, setAddVenue] = useState<RevenueVenue>('other')
  const [addDate, setAddDate] = useState('')
  const [addStatus, setAddStatus] = useState<EntryStatus>('active')

  const loadEntries = async () => {
    const response = await authedFetch('/api/tools/revenue-tracker')
    if (!response.ok) {
      setError('Failed to load revenue entries.')
      return
    }
    const data = (await response.json()) as ToolApiResponse
    setEntries((data.entries || []).map(parseRevenueEntry))
  }

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true)
        await loadEntries()
      } catch {
        setError('Failed to load revenue entries.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleAdd = async () => {
    if (!addTitle.trim()) { setError('Title is required.'); return }
    try {
      setError('')
      setBusyId('new')
      const response = await authedFetch('/api/tools/revenue-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: addTitle.trim(),
          details: addDetails.trim(),
          status: addStatus,
          eventDate: addDate ? new Date(addDate).toISOString() : null,
          amountCents: addAmount ? Math.max(0, Math.round(Number(addAmount) * 100)) : null,
          metadata: { venue: addVenue },
        }),
      })
      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        setError(data.error || 'Could not add entry.')
        return
      }
      setAddTitle('')
      setAddDetails('')
      setAddAmount('')
      setAddDate('')
      setAddVenue('other')
      setAddStatus('active')
      setShowAddForm(false)
      await loadEntries()
    } catch {
      setError('Could not add entry.')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this revenue entry?')) return
    try {
      setBusyId(id)
      const response = await authedFetch('/api/tools/revenue-tracker', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!response.ok) { setError('Could not delete entry.'); return }
      await loadEntries()
    } catch {
      setError('Could not delete entry.')
    } finally {
      setBusyId(null)
    }
  }

  const handleUpdate = async (entry: RevenueEntry, changes: Partial<RevenueEntry>) => {
    try {
      setBusyId(entry.id)
      const updated = { ...entry, ...changes }
      const response = await authedFetch('/api/tools/revenue-tracker', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: updated.id,
          title: updated.title,
          details: updated.details,
          status: updated.status,
          eventDate: updated.event_date,
          amountCents: updated.amount_cents,
          metadata: { venue: updated.venue },
        }),
      })
      if (!response.ok) { setError('Could not update entry.'); return }
      await loadEntries()
    } catch {
      setError('Could not update entry.')
    } finally {
      setBusyId(null)
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const yearStart = new Date(now.getFullYear(), 0, 1)

    let allTime = 0
    let thisMonth = 0
    let thisYear = 0
    const byVenue: Partial<Record<RevenueVenue, number>> = {}

    for (const e of entries) {
      const cents = e.amount_cents || 0
      allTime += cents
      const d = e.event_date ? new Date(e.event_date) : new Date(e.created_at)
      if (d >= monthStart) thisMonth += cents
      if (d >= yearStart) thisYear += cents
      byVenue[e.venue] = (byVenue[e.venue] || 0) + cents
    }

    const maxVenueCents = Math.max(0, ...Object.values(byVenue).filter(Boolean) as number[])
    const sortedVenues = (Object.entries(byVenue) as [RevenueVenue, number][]).sort((a, b) => b[1] - a[1])

    return { allTime, thisMonth, thisYear, byVenue, maxVenueCents, sortedVenues }
  }, [entries])

  const filtered = useMemo(() =>
    filterVenue === 'all' ? entries : entries.filter((e) => e.venue === filterVenue),
    [entries, filterVenue]
  )

  const venuesUsed = useMemo(() =>
    Array.from(new Set(entries.map((e) => e.venue))),
    [entries]
  )

  return (
    <div className="min-h-screen px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* ── Header ── */}
        <header className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">My Revenue Tracker</p>
              <h1 className="mt-2 text-3xl font-black text-zinc-50">Revenue Dashboard</h1>
              <p className="mt-1 text-sm text-zinc-400">Track income from every venue in the organization. Your data is private to you.</p>
            </div>
            <div className="flex gap-3">
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100"
              >
                <ArrowLeft size={16} /> Dashboard
              </Link>
              <button
                type="button"
                onClick={() => setShowAddForm((v) => !v)}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200"
              >
                <Plus size={16} /> Log Revenue
              </button>
            </div>
          </div>
        </header>

        {/* ── Stats Cards ── */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'This Month', cents: totals.thisMonth, accent: 'border-orange-300/40 bg-orange-300/5' },
            { label: 'This Year', cents: totals.thisYear, accent: 'border-violet-300/40 bg-violet-300/5' },
            { label: 'All Time', cents: totals.allTime, accent: 'border-emerald-300/40 bg-emerald-300/5' },
          ].map(({ label, cents, accent }) => (
            <article key={label} className={`rounded-2xl border p-5 ${accent}`}>
              <div className="flex items-center gap-2 text-zinc-400">
                <TrendingUp size={14} />
                <span className="text-xs font-semibold uppercase tracking-[0.15em]">{label}</span>
              </div>
              <p className="mt-3 text-3xl font-black tabular-nums text-zinc-50">
                {loading ? '—' : <AnimatedNumber value={Math.round(cents / 100)} prefix="$" />}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{entries.filter((e) => {
                if (label === 'All Time') return true
                const now = new Date()
                const d = e.event_date ? new Date(e.event_date) : new Date(e.created_at)
                if (label === 'This Month') return d >= new Date(now.getFullYear(), now.getMonth(), 1)
                return d >= new Date(now.getFullYear(), 0, 1)
              }).length} entries</p>
            </article>
          ))}
        </div>

        {/* ── Revenue by Venue Chart ── */}
        {totals.sortedVenues.length > 0 ? (
          <section className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
            <h2 className="text-base font-bold text-zinc-50">Revenue by Venue</h2>
            <div className="mt-5 space-y-3">
              {totals.sortedVenues.map(([venue, cents]) => (
                <VenueBar
                  key={venue}
                  label={VENUE_LABELS[venue]}
                  cents={cents}
                  maxCents={totals.maxVenueCents}
                  color={VENUE_COLORS[venue]}
                />
              ))}
            </div>
          </section>
        ) : null}

        {/* ── Add Form ── */}
        {showAddForm ? (
          <section className="rounded-2xl border border-orange-200/30 bg-zinc-900/60 p-6 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-50">Log Revenue Entry</h2>
              <button type="button" onClick={() => setShowAddForm(false)} className="rounded-lg border border-zinc-200/20 p-1.5 text-zinc-400 transition hover:text-zinc-50">
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                placeholder="Revenue source name (e.g. Course Sale)"
                className="sm:col-span-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
              />
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-400">Venue</label>
                <select
                  value={addVenue}
                  onChange={(e) => setAddVenue(e.target.value as RevenueVenue)}
                  className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                >
                  {(Object.keys(VENUE_LABELS) as RevenueVenue[]).map((v) => (
                    <option key={v} value={v}>{VENUE_LABELS[v]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-400">Amount (USD)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-400">Date Received</label>
                <input
                  type="date"
                  value={addDate}
                  onChange={(e) => setAddDate(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-400">Status</label>
                <select
                  value={addStatus}
                  onChange={(e) => setAddStatus(e.target.value as EntryStatus)}
                  className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                >
                  {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <textarea
                value={addDetails}
                onChange={(e) => setAddDetails(e.target.value)}
                placeholder="Notes (optional)"
                rows={3}
                className="sm:col-span-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
              />
            </div>
            {error ? <p className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
            <button
              type="button"
              onClick={() => { void handleAdd() }}
              disabled={busyId === 'new'}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-300 px-4 py-2 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70"
            >
              <Plus size={16} /> {busyId === 'new' ? 'Saving...' : 'Log Revenue'}
            </button>
          </section>
        ) : null}

        {error && !showAddForm ? (
          <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>
        ) : null}

        {/* ── Venue Filter Tabs ── */}
        {venuesUsed.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilterVenue('all')}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${filterVenue === 'all' ? 'border-orange-200/70 bg-orange-200/10 text-orange-100' : 'border-zinc-200/20 text-zinc-300 hover:border-zinc-200/40'}`}
            >
              All Venues
            </button>
            {venuesUsed.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setFilterVenue(v)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${filterVenue === v ? 'border-orange-200/70 bg-orange-200/10 text-orange-100' : 'border-zinc-200/20 text-zinc-300 hover:border-zinc-200/40'}`}
                style={filterVenue === v ? { borderColor: VENUE_COLORS[v] + '80', color: VENUE_COLORS[v] } : {}}
              >
                {VENUE_LABELS[v]}
              </button>
            ))}
          </div>
        ) : null}

        {/* ── Entries List ── */}
        {loading ? <p className="text-zinc-300">Loading your revenue data...</p> : null}

        {!loading && filtered.length === 0 ? (
          <article className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-zinc-200/20 bg-zinc-800">
              <TrendingUp size={22} className="text-zinc-400" />
            </div>
            <p className="font-semibold text-zinc-200">No revenue logged yet</p>
            <p className="mt-1 text-sm text-zinc-500">Click "Log Revenue" to start tracking your income streams.</p>
          </article>
        ) : null}

        <div className="space-y-3">
          {filtered.map((entry) => (
            <RevenueEntryCard
              key={entry.id}
              entry={entry}
              busy={busyId === entry.id}
              onUpdate={(changes) => { void handleUpdate(entry, changes) }}
              onDelete={() => { void handleDelete(entry.id) }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function RevenueEntryCard({
  entry,
  busy,
  onUpdate,
  onDelete,
}: {
  entry: RevenueEntry
  busy: boolean
  onUpdate: (changes: Partial<RevenueEntry>) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(entry.title)
  const [details, setDetails] = useState(entry.details)
  const [amount, setAmount] = useState(entry.amount_cents !== null ? (entry.amount_cents / 100).toString() : '')
  const [venue, setVenue] = useState<RevenueVenue>(entry.venue)
  const [date, setDate] = useState(entry.event_date ? new Date(entry.event_date).toISOString().split('T')[0] : '')
  const [status, setStatus] = useState<EntryStatus>(entry.status)

  const color = VENUE_COLORS[entry.venue] || '#9ca3af'

  if (!editing) {
    return (
      <article className="group flex items-center gap-4 rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-4 transition hover:border-zinc-200/30">
        <div className="h-10 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-zinc-50 truncate">{entry.title}</h3>
            <span className="rounded-full border px-2 py-0.5 text-xs font-medium" style={{ borderColor: color + '60', color }}>
              {VENUE_LABELS[entry.venue]}
            </span>
            <span className="rounded-full border border-zinc-200/20 px-2 py-0.5 text-xs text-zinc-400">
              {entry.status}
            </span>
          </div>
          {entry.details ? <p className="mt-0.5 text-sm text-zinc-400 truncate">{entry.details}</p> : null}
          {entry.event_date ? (
            <p className="mt-0.5 text-xs text-zinc-500">{new Date(entry.event_date).toLocaleDateString()}</p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-black tabular-nums" style={{ color }}>{formatCents(entry.amount_cents)}</p>
        </div>
        <div className="flex shrink-0 gap-2 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-zinc-200/20 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition hover:border-orange-200/60"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="rounded-lg border border-rose-300/30 p-1.5 text-rose-300 transition hover:border-rose-200 disabled:opacity-50"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </article>
    )
  }

  return (
    <article className="rounded-2xl border border-orange-200/30 bg-zinc-900/60 p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="sm:col-span-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
        />
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Venue</label>
          <select
            value={venue}
            onChange={(e) => setVenue(e.target.value as RevenueVenue)}
            className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
          >
            {(Object.keys(VENUE_LABELS) as RevenueVenue[]).map((v) => (
              <option key={v} value={v}>{VENUE_LABELS[v]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Amount (USD)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as EntryStatus)}
            className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
          >
            {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={3}
          placeholder="Notes"
          className="sm:col-span-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => {
            onUpdate({
              title,
              details,
              venue,
              status,
              event_date: date ? new Date(date).toISOString() : null,
              amount_cents: amount ? Math.max(0, Math.round(Number(amount) * 100)) : null,
            })
            setEditing(false)
          }}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70"
        >
          <Save size={14} /> {busy ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-lg border border-zinc-200/20 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-zinc-200/40"
        >
          Cancel
        </button>
      </div>
    </article>
  )
}

// ─── Knowledge Vault ───────────────────────────────────────────────────────────

type DocCategory = 'all' | 'tutorial' | 'document' | 'template' | 'guide' | 'script'
type DocDifficulty = 'beginner' | 'intermediate' | 'advanced'

type KnowledgeDoc = {
  id: string
  title: string
  details: string
  category: DocCategory
  difficulty: DocDifficulty
  tags: string[]
  file_url: string | null
  view_count: number
  created_by: string | null
  updated_at: string
}

const CATEGORY_LABELS: Record<DocCategory, string> = {
  all: 'All',
  tutorial: 'Tutorial',
  document: 'Document',
  template: 'Template',
  guide: 'Guide',
  script: 'Script',
}

const DIFFICULTY_COLORS: Record<DocDifficulty, string> = {
  beginner: 'text-emerald-300 border-emerald-300/40',
  intermediate: 'text-orange-200 border-orange-200/40',
  advanced: 'text-rose-300 border-rose-300/40',
}

function categoryIcon(category: DocCategory) {
  const size = 14
  switch (category) {
    case 'tutorial': return <GraduationCap size={size} />
    case 'document': return <FileText size={size} />
    case 'template': return <LayoutTemplate size={size} />
    case 'guide': return <BookOpen size={size} />
    case 'script': return <Tag size={size} />
    default: return <FileText size={size} />
  }
}

function parseDocMeta(entry: ToolEntry): KnowledgeDoc {
  const meta = entry.metadata || {}
  return {
    id: entry.id,
    title: entry.title,
    details: entry.details,
    category: (meta.category as DocCategory) || 'document',
    difficulty: (meta.difficulty as DocDifficulty) || 'beginner',
    tags: Array.isArray(meta.tags) ? (meta.tags as string[]) : [],
    file_url: typeof meta.file_url === 'string' ? meta.file_url : null,
    view_count: typeof meta.view_count === 'number' ? meta.view_count : 0,
    created_by: entry.created_by,
    updated_at: entry.updated_at,
  }
}

function KnowledgeVaultPage() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<DocCategory>('all')
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDoc | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  // Add form state
  const [addTitle, setAddTitle] = useState('')
  const [addDetails, setAddDetails] = useState('')
  const [addCategory, setAddCategory] = useState<DocCategory>('document')
  const [addDifficulty, setAddDifficulty] = useState<DocDifficulty>('beginner')
  const [addTags, setAddTags] = useState('')
  const [addUrl, setAddUrl] = useState('')
  const [addBusy, setAddBusy] = useState(false)

  const loadDocs = async () => {
    const response = await authedFetch('/api/tools/knowledge-vault')
    if (!response.ok) {
      setError('Failed to load library.')
      return
    }
    const data = (await response.json()) as ToolApiResponse
    setDocs((data.entries || []).map(parseDocMeta))
  }

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true)
        await loadDocs()
      } catch {
        setError('Failed to load library.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const trackView = async (doc: KnowledgeDoc) => {
    setSelectedDoc(doc)
    // Fire-and-forget view tracking
    void authedFetch('/api/knowledge-vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: doc.id }),
    })
  }

  const handleAdd = async () => {
    if (!addTitle.trim()) {
      setError('Title is required.')
      return
    }
    try {
      setError('')
      setAddBusy(true)
      const response = await authedFetch('/api/tools/knowledge-vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: addTitle.trim(),
          details: addDetails.trim(),
          status: 'active',
          metadata: {
            category: addCategory,
            difficulty: addDifficulty,
            tags: addTags.split(',').map((t) => t.trim()).filter(Boolean),
            file_url: addUrl.trim() || null,
            view_count: 0,
          },
        }),
      })
      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        setError(data.error || 'Could not add document.')
        return
      }
      setAddTitle('')
      setAddDetails('')
      setAddCategory('document')
      setAddDifficulty('beginner')
      setAddTags('')
      setAddUrl('')
      setShowAddForm(false)
      await loadDocs()
    } catch {
      setError('Could not add document.')
    } finally {
      setAddBusy(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document from the library?')) return
    try {
      const response = await authedFetch('/api/tools/knowledge-vault', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!response.ok) {
        setError('Could not delete document.')
        return
      }
      if (selectedDoc?.id === id) setSelectedDoc(null)
      await loadDocs()
    } catch {
      setError('Could not delete document.')
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return docs.filter((doc) => {
      const matchesCategory = activeCategory === 'all' || doc.category === activeCategory
      const matchesSearch =
        !q ||
        doc.title.toLowerCase().includes(q) ||
        doc.details.toLowerCase().includes(q) ||
        doc.tags.some((tag) => tag.toLowerCase().includes(q))
      return matchesCategory && matchesSearch
    })
  }, [docs, activeCategory, search])

  return (
    <div className="min-h-screen px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <header className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Dashboard Tool</p>
              <h1 className="mt-2 text-3xl font-black text-zinc-50">Knowledge Vault</h1>
              <p className="mt-2 max-w-3xl text-sm text-zinc-300">
                Your organization's library of tutorials, guides, templates, and reusable frameworks.
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100"
              >
                <ArrowLeft size={16} /> Dashboard
              </Link>
              <button
                type="button"
                onClick={() => setShowAddForm((v) => !v)}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200"
              >
                <Plus size={16} /> Add Document
              </button>
            </div>
          </div>
        </header>

        {/* Add Form */}
        {showAddForm ? (
          <section className="rounded-2xl border border-orange-200/30 bg-zinc-900/60 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-50">Add to Library</h2>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="rounded-lg border border-zinc-200/20 p-1.5 text-zinc-400 transition hover:text-zinc-50"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input
                type="text"
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                placeholder="Document title"
                className="md:col-span-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
              />
              <select
                value={addCategory}
                onChange={(e) => setAddCategory(e.target.value as DocCategory)}
                className="rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
              >
                {(['document', 'tutorial', 'guide', 'template', 'script'] as const).map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
              <select
                value={addDifficulty}
                onChange={(e) => setAddDifficulty(e.target.value as DocDifficulty)}
                className="rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
              <input
                type="text"
                value={addTags}
                onChange={(e) => setAddTags(e.target.value)}
                placeholder="Tags (comma-separated)"
                className="rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
              />
              <input
                type="url"
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                placeholder="External URL (optional)"
                className="rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
              />
              <textarea
                value={addDetails}
                onChange={(e) => setAddDetails(e.target.value)}
                placeholder="Description or full content"
                rows={5}
                className="md:col-span-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
              />
            </div>
            {error ? (
              <p className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>
            ) : null}
            <button
              type="button"
              onClick={() => { void handleAdd() }}
              disabled={addBusy}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-300 px-4 py-2 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70"
            >
              <Plus size={16} /> {addBusy ? 'Adding...' : 'Add to Library'}
            </button>
          </section>
        ) : null}

        {/* Search + Filter */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search library..."
              className="w-full rounded-lg border border-zinc-200/20 bg-zinc-900/60 py-2 pl-9 pr-3 text-sm text-zinc-100 outline-none transition focus:border-orange-200/70"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CATEGORY_LABELS) as DocCategory[]).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                  activeCategory === cat
                    ? 'border-orange-200/70 bg-orange-200/10 text-orange-100'
                    : 'border-zinc-200/20 text-zinc-300 hover:border-zinc-200/40 hover:text-zinc-50'
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>

        {/* Library Grid */}
        {loading ? <p className="text-zinc-300">Loading library...</p> : null}

        {!loading && filtered.length === 0 ? (
          <article className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8 text-center text-zinc-400">
            {search || activeCategory !== 'all' ? 'No documents match your filter.' : 'No documents in the library yet. Add the first one.'}
          </article>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((doc) => (
            <article
              key={doc.id}
              className="group flex flex-col rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5 transition hover:border-orange-300/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-zinc-400">
                  {categoryIcon(doc.category)}
                  <span className="text-xs font-semibold uppercase tracking-[0.15em]">{CATEGORY_LABELS[doc.category]}</span>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${DIFFICULTY_COLORS[doc.difficulty]}`}>
                  {doc.difficulty}
                </span>
              </div>
              <h3 className="mt-3 text-base font-bold text-zinc-50 group-hover:text-orange-100">{doc.title}</h3>
              {doc.details ? (
                <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-zinc-400">{doc.details}</p>
              ) : null}
              {doc.tags.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {doc.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-zinc-800/80 px-2 py-0.5 text-xs text-zinc-400">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-auto pt-4 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-xs text-zinc-500">
                  <Eye size={12} /> {doc.view_count} views
                </span>
                <div className="flex items-center gap-2">
                  {doc.file_url ? (
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => { void trackView(doc) }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/20 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition hover:border-orange-200/60 hover:text-orange-100"
                    >
                      <ExternalLink size={12} /> Open
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => { void trackView(doc) }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-orange-300/90 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-orange-200"
                  >
                    <BookOpen size={12} /> Read
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleDelete(doc.id) }}
                    className="rounded-lg p-1.5 text-zinc-500 transition hover:text-rose-300"
                    aria-label="Delete document"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Document Detail Panel */}
      {selectedDoc ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end bg-zinc-950/70 backdrop-blur-sm"
          onClick={() => setSelectedDoc(null)}
        >
          <aside
            className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-zinc-900 p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedDoc(null)}
              className="absolute right-5 top-5 rounded-lg border border-zinc-200/20 p-1.5 text-zinc-400 transition hover:text-zinc-50"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 text-zinc-400">
              {categoryIcon(selectedDoc.category)}
              <span className="text-xs font-semibold uppercase tracking-[0.15em]">{CATEGORY_LABELS[selectedDoc.category]}</span>
              <span className={`ml-auto rounded-full border px-2 py-0.5 text-xs font-medium ${DIFFICULTY_COLORS[selectedDoc.difficulty]}`}>
                {selectedDoc.difficulty}
              </span>
            </div>

            <h2 className="mt-4 text-2xl font-black text-zinc-50">{selectedDoc.title}</h2>

            {selectedDoc.tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedDoc.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-zinc-800/80 px-2.5 py-0.5 text-xs text-zinc-400">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-6 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
              {selectedDoc.details || 'No content provided for this document.'}
            </div>

            {selectedDoc.file_url ? (
              <a
                href={selectedDoc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-orange-300 px-4 py-2.5 font-semibold text-zinc-950 transition hover:bg-orange-200"
              >
                <ExternalLink size={16} /> Open Resource
              </a>
            ) : null}

            <p className="mt-4 text-xs text-zinc-500">
              Added by {selectedDoc.created_by || 'admin'} · Updated {new Date(selectedDoc.updated_at).toLocaleDateString()}
            </p>
          </aside>
        </div>
      ) : null}
    </div>
  )
}
