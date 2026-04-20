import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Briefcase,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Plus,
  Search,
  Send,
  Users,
  X,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { authedFetch } from '../lib/supabaseBrowser'

// ─── Types ───────────────────────────────────────────────────────────────────

type CollabRequest = {
  id: string
  owner_email: string
  title: string
  description: string
  skills_needed: string[]
  spots_available: number
  status: 'open' | 'closed' | 'completed'
  project_url: string | null
  created_at: string
  updated_at: string
  hasApplied: boolean
  isOwner: boolean
  applicantCount: number
}

type CollabApplicant = {
  id: string
  applicant_email: string
  message: string
  status: 'pending' | 'accepted' | 'rejected'
  applied_at: string
  profile: {
    display_name: string | null
    avatar_url: string | null
    bio: string | null
    skills: string[] | null
  } | null
}

type MyApplication = {
  id: string
  request_id: string
  message: string
  status: 'pending' | 'accepted' | 'rejected'
  applied_at: string
  requestTitle: string | null
  requestOwner: string | null
}

type CollabApiResponse = { requests: CollabRequest[] }
type ApplyApiResponse = { applications: MyApplication[] }
type ApplicantsApiResponse = { applicants: CollabApplicant[] }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    open: 'border-emerald-300/40 text-emerald-300',
    closed: 'border-zinc-500/40 text-zinc-400',
    completed: 'border-violet-300/40 text-violet-300',
    pending: 'border-orange-300/40 text-orange-300',
    accepted: 'border-emerald-300/40 text-emerald-300',
    rejected: 'border-rose-300/40 text-rose-300',
  }
  return `rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles[status] || 'border-zinc-300/40 text-zinc-300'}`
}

function Avatar({ url, name, size = 10 }: { url: string | null; name: string; size?: number }) {
  const initials = name.split('@')[0].slice(0, 2).toUpperCase()
  const sizeClass = `h-${size} w-${size}`
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`${sizeClass} rounded-full object-cover border border-zinc-200/20 flex-shrink-0`}
      />
    )
  }
  return (
    <div
      className={`${sizeClass} flex flex-shrink-0 items-center justify-center rounded-full bg-orange-300/20 border border-orange-300/30 text-xs font-bold text-orange-200`}
    >
      {initials}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SkillChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-zinc-200/20 bg-zinc-800/60 px-2.5 py-0.5 text-xs text-zinc-300">
      {label}
    </span>
  )
}

function ApplicantsDrawer({
  requestId,
  requestTitle,
  onClose,
}: {
  requestId: string
  requestTitle: string
  onClose: () => void
}) {
  const [applicants, setApplicants] = useState<CollabApplicant[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    const response = await authedFetch(`/api/collab/applicants?requestId=${requestId}`)
    if (response.ok) {
      const data = (await response.json()) as ApplicantsApiResponse
      setApplicants(data.applicants || [])
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [requestId])

  const updateStatus = async (applicationId: string, status: 'accepted' | 'rejected') => {
    setBusyId(applicationId)
    const response = await authedFetch('/api/collab/applicants', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId, status }),
    })
    if (response.ok) {
      setApplicants((prev) =>
        prev.map((a) => (a.id === applicationId ? { ...a, status } : a))
      )
    }
    setBusyId(null)
  }

  const pending = applicants.filter((a) => a.status === 'pending')
  const decided = applicants.filter((a) => a.status !== 'pending')

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-zinc-950/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-zinc-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg border border-zinc-200/20 p-1.5 text-zinc-400 transition hover:text-zinc-50"
        >
          <X size={18} />
        </button>

        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">Applicants</p>
        <h2 className="mt-1 text-xl font-bold text-zinc-50 pr-8">{requestTitle}</h2>

        {loading ? (
          <p className="mt-6 text-sm text-zinc-400">Loading applicants...</p>
        ) : applicants.length === 0 ? (
          <div className="mt-8 rounded-xl border border-zinc-200/15 bg-zinc-800/60 p-6 text-center">
            <Users size={24} className="mx-auto mb-2 text-zinc-500" />
            <p className="text-sm text-zinc-400">No one has applied yet.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {pending.length > 0 && (
              <section>
                <h3 className="mb-3 text-sm font-semibold text-orange-200">Pending ({pending.length})</h3>
                <div className="space-y-3">
                  {pending.map((applicant) => (
                    <ApplicantCard
                      key={applicant.id}
                      applicant={applicant}
                      busy={busyId === applicant.id}
                      onAccept={() => { void updateStatus(applicant.id, 'accepted') }}
                      onReject={() => { void updateStatus(applicant.id, 'rejected') }}
                    />
                  ))}
                </div>
              </section>
            )}
            {decided.length > 0 && (
              <section>
                <h3 className="mb-3 text-sm font-semibold text-zinc-400">Decided ({decided.length})</h3>
                <div className="space-y-3">
                  {decided.map((applicant) => (
                    <ApplicantCard
                      key={applicant.id}
                      applicant={applicant}
                      busy={busyId === applicant.id}
                      onAccept={() => { void updateStatus(applicant.id, 'accepted') }}
                      onReject={() => { void updateStatus(applicant.id, 'rejected') }}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}

function ApplicantCard({
  applicant,
  busy,
  onAccept,
  onReject,
}: {
  applicant: CollabApplicant
  busy: boolean
  onAccept: () => void
  onReject: () => void
}) {
  const name = applicant.profile?.display_name || applicant.applicant_email.split('@')[0]
  return (
    <article className="rounded-xl border border-zinc-200/15 bg-zinc-800/60 p-4">
      <div className="flex items-start gap-3">
        <Avatar url={applicant.profile?.avatar_url || null} name={name} size={10} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-zinc-100 truncate">{name}</span>
            <span className={statusBadge(applicant.status)}>{applicant.status}</span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">{applicant.applicant_email}</p>
          {applicant.profile?.bio ? (
            <p className="mt-1.5 text-sm text-zinc-400 line-clamp-2">{applicant.profile.bio}</p>
          ) : null}
          {applicant.profile?.skills?.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {applicant.profile.skills.slice(0, 5).map((s) => (
                <SkillChip key={s} label={s} />
              ))}
            </div>
          ) : null}
          {applicant.message ? (
            <blockquote className="mt-2 rounded-lg border border-zinc-200/10 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300 italic">
              "{applicant.message}"
            </blockquote>
          ) : null}
          <p className="mt-2 text-xs text-zinc-500">
            Applied {new Date(applicant.applied_at).toLocaleDateString()}
          </p>
        </div>
      </div>
      {applicant.status === 'pending' ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {busy ? '...' : '✓ Accept'}
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="flex-1 rounded-lg border border-rose-300/30 py-2 text-sm font-semibold text-rose-300 transition hover:border-rose-200 disabled:opacity-60"
          >
            {busy ? '...' : '✕ Decline'}
          </button>
        </div>
      ) : null}
    </article>
  )
}

function ApplyModal({
  request,
  onClose,
  onSuccess,
}: {
  request: CollabRequest
  onClose: () => void
  onSuccess: () => void
}) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setBusy(true)
    setError('')
    const response = await authedFetch('/api/collab/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: request.id, message }),
    })
    if (response.ok) {
      onSuccess()
      onClose()
    } else {
      const data = (await response.json()) as { error?: string }
      setError(data.error || 'Could not submit application.')
    }
    setBusy(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-200/15 bg-zinc-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">Apply to Collaborate</p>
            <h3 className="mt-1 text-lg font-bold text-zinc-50">{request.title}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-zinc-200/20 p-1.5 text-zinc-400 hover:text-zinc-50">
            <X size={16} />
          </button>
        </div>
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Why are you a great fit? (optional)</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={500}
            placeholder="Tell the owner a bit about yourself and what you bring to this collaboration..."
            className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-200/70 resize-none"
          />
          <p className="mt-1 text-right text-xs text-zinc-500">{message.length}/500</p>
        </div>
        {error ? (
          <p className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>
        ) : null}
        <button
          type="button"
          onClick={() => { void submit() }}
          disabled={busy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-300 py-2.5 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70"
        >
          <Send size={16} /> {busy ? 'Sending...' : 'Submit Application'}
        </button>
      </div>
    </div>
  )
}

function RequestCard({
  req,
  onApply,
  onViewApplicants,
  onClose,
  onDelete,
}: {
  req: CollabRequest
  onApply: (req: CollabRequest) => void
  onViewApplicants: (req: CollabRequest) => void
  onClose: (req: CollabRequest) => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <article className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5 transition hover:border-zinc-200/25">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={statusBadge(req.status)}>{req.status}</span>
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <Users size={11} /> {req.spots_available} spot{req.spots_available !== 1 ? 's' : ''}
            </span>
            {req.isOwner && req.applicantCount > 0 ? (
              <span className="rounded-full border border-orange-300/40 bg-orange-300/10 px-2 py-0.5 text-xs font-semibold text-orange-200">
                {req.applicantCount} applicant{req.applicantCount !== 1 ? 's' : ''}
              </span>
            ) : null}
          </div>
          <h3 className="mt-2 text-base font-bold text-zinc-50">{req.title}</h3>
          <p className="mt-0.5 text-xs text-zinc-500">by {req.owner_email.split('@')[0]}</p>

          {req.description ? (
            <p className={`mt-2 text-sm text-zinc-400 ${expanded ? '' : 'line-clamp-2'}`}>
              {req.description}
            </p>
          ) : null}

          {req.skills_needed.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {req.skills_needed.map((s) => (
                <SkillChip key={s} label={s} />
              ))}
            </div>
          ) : null}

          {req.project_url ? (
            <a
              href={req.project_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-orange-200 transition hover:text-orange-100"
            >
              <ExternalLink size={11} /> View Project
            </a>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-lg border border-zinc-200/15 p-1.5 text-zinc-500 transition hover:text-zinc-300"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded ? (
        <div className="mt-4 flex items-center gap-2 border-t border-zinc-200/10 pt-4 flex-wrap">
          <p className="text-xs text-zinc-500 flex-1">
            Posted {new Date(req.created_at).toLocaleDateString()}
          </p>
          {req.isOwner ? (
            <>
              <button
                type="button"
                onClick={() => onViewApplicants(req)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/20 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition hover:border-orange-200/40"
              >
                <Users size={12} /> Applicants {req.applicantCount > 0 ? `(${req.applicantCount})` : ''}
              </button>
              {req.status === 'open' ? (
                <button
                  type="button"
                  onClick={() => onClose(req)}
                  className="rounded-lg border border-zinc-200/20 px-3 py-1.5 text-xs font-semibold text-zinc-400 transition hover:border-zinc-200/40 hover:text-zinc-200"
                >
                  Close Request
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onDelete(req.id)}
                className="rounded-lg border border-rose-300/20 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:border-rose-200/50"
              >
                Delete
              </button>
            </>
          ) : (
            <>
              {req.hasApplied ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/40 bg-emerald-300/5 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                  <Check size={12} /> Applied
                </span>
              ) : req.status === 'open' ? (
                <button
                  type="button"
                  onClick={() => onApply(req)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-orange-300 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-orange-200"
                >
                  <Send size={12} /> Apply
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </article>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CollaborationHub() {
  const [tab, setTab] = useState<'browse' | 'my-projects' | 'my-applications'>('browse')
  const [browseRequests, setBrowseRequests] = useState<CollabRequest[]>([])
  const [myRequests, setMyRequests] = useState<CollabRequest[]>([])
  const [myApplications, setMyApplications] = useState<MyApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  // Modals
  const [applyTarget, setApplyTarget] = useState<CollabRequest | null>(null)
  const [applicantsTarget, setApplicantsTarget] = useState<CollabRequest | null>(null)

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createSkills, setCreateSkills] = useState('')
  const [createSpots, setCreateSpots] = useState('1')
  const [createUrl, setCreateUrl] = useState('')
  const [createBusy, setCreateBusy] = useState(false)

  const loadBrowse = async () => {
    const response = await authedFetch('/api/collab')
    if (response.ok) {
      const data = (await response.json()) as CollabApiResponse
      setBrowseRequests(data.requests || [])
    }
  }

  const loadMine = async () => {
    const response = await authedFetch('/api/collab?mine=1')
    if (response.ok) {
      const data = (await response.json()) as CollabApiResponse
      setMyRequests(data.requests || [])
    }
  }

  const loadApplications = async () => {
    const response = await authedFetch('/api/collab/apply')
    if (response.ok) {
      const data = (await response.json()) as ApplyApiResponse
      setMyApplications(data.applications || [])
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true)
        await Promise.all([loadBrowse(), loadMine(), loadApplications()])
      } catch {
        setError('Failed to load collaboration hub.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleCreate = async () => {
    if (!createTitle.trim()) { setError('Title is required.'); return }
    setCreateBusy(true)
    setError('')
    const response = await authedFetch('/api/collab', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: createTitle.trim(),
        description: createDescription.trim(),
        skillsNeeded: createSkills.split(',').map((s) => s.trim()).filter(Boolean),
        spotsAvailable: Math.max(1, parseInt(createSpots) || 1),
        projectUrl: createUrl.trim() || undefined,
      }),
    })
    if (response.ok) {
      setCreateTitle('')
      setCreateDescription('')
      setCreateSkills('')
      setCreateSpots('1')
      setCreateUrl('')
      setShowCreate(false)
      await Promise.all([loadBrowse(), loadMine()])
      setTab('my-projects')
    } else {
      const data = (await response.json()) as { error?: string }
      setError(data.error || 'Could not create request.')
    }
    setCreateBusy(false)
  }

  const handleClose = async (req: CollabRequest) => {
    await authedFetch('/api/collab', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: req.id, status: 'closed' }),
    })
    await Promise.all([loadBrowse(), loadMine()])
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this collab request? This cannot be undone.')) return
    await authedFetch('/api/collab', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await Promise.all([loadBrowse(), loadMine()])
  }

  const displayed = useMemo(() => {
    const list = tab === 'browse' ? browseRequests : tab === 'my-projects' ? myRequests : []
    if (!search) return list
    const q = search.toLowerCase()
    return list.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.skills_needed.some((s) => s.toLowerCase().includes(q))
    )
  }, [tab, browseRequests, myRequests, search])

  return (
    <div className="min-h-screen px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <header className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Dashboard Tool</p>
              <h1 className="mt-2 text-3xl font-black text-zinc-50">Collaboration Hub</h1>
              <p className="mt-1 text-sm text-zinc-400">
                Post collab requests, find partners, and build projects together.
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
                onClick={() => setShowCreate((v) => !v)}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200"
              >
                <Plus size={16} /> Post Request
              </button>
            </div>
          </div>
        </header>

        {/* Create Form */}
        {showCreate ? (
          <section className="rounded-2xl border border-orange-200/30 bg-zinc-900/60 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-50">Post a Collaboration Request</h2>
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-zinc-200/20 p-1.5 text-zinc-400 hover:text-zinc-50">
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="Project / collab title"
                className="sm:col-span-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none focus:border-orange-200/70"
              />
              <textarea
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                rows={4}
                placeholder="Describe the project, goals, and what kind of collaborators you're looking for..."
                className="sm:col-span-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-orange-200/70 resize-none"
              />
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-400">Skills Needed (comma-separated)</label>
                <input
                  type="text"
                  value={createSkills}
                  onChange={(e) => setCreateSkills(e.target.value)}
                  placeholder="Video editing, Copywriting, Design..."
                  className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none focus:border-orange-200/70"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-400">Spots Available</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={createSpots}
                  onChange={(e) => setCreateSpots(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none focus:border-orange-200/70"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-zinc-400">Project URL (optional)</label>
                <input
                  type="url"
                  value={createUrl}
                  onChange={(e) => setCreateUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none focus:border-orange-200/70"
                />
              </div>
            </div>
            {error ? (
              <p className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>
            ) : null}
            <button
              type="button"
              onClick={() => { void handleCreate() }}
              disabled={createBusy}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-300 px-4 py-2 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70"
            >
              <Briefcase size={16} /> {createBusy ? 'Posting...' : 'Post Request'}
            </button>
          </section>
        ) : null}

        {error && !showCreate ? (
          <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>
        ) : null}

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-200/15 bg-zinc-900/60 p-1">
          {([
            { key: 'browse', label: 'Browse', count: browseRequests.length },
            { key: 'my-projects', label: 'My Projects', count: myRequests.length },
            { key: 'my-applications', label: 'My Applications', count: myApplications.length },
          ] as const).map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                tab === key ? 'bg-orange-300 text-zinc-950' : 'text-zinc-300 hover:text-zinc-50'
              }`}
            >
              {label}
              {count > 0 ? (
                <span className={`rounded-full px-1.5 py-0.5 text-xs ${tab === key ? 'bg-zinc-950/20' : 'bg-zinc-700'}`}>
                  {count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Search (browse + my-projects) */}
        {tab !== 'my-applications' ? (
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, description, or skill..."
              className="w-full rounded-lg border border-zinc-200/20 bg-zinc-900/60 py-2 pl-9 pr-3 text-sm text-zinc-100 outline-none transition focus:border-orange-200/70"
            />
          </div>
        ) : null}

        {/* Content */}
        {loading ? <p className="text-zinc-400">Loading...</p> : null}

        {/* Browse / My Projects */}
        {!loading && tab !== 'my-applications' ? (
          <div className="space-y-4">
            {displayed.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8 text-center">
                <Briefcase size={28} className="mx-auto mb-3 text-zinc-500" />
                <p className="font-semibold text-zinc-300">
                  {tab === 'browse' ? 'No open collab requests right now.' : 'You haven\'t posted any requests yet.'}
                </p>
                {tab === 'my-projects' ? (
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200"
                  >
                    <Plus size={14} /> Post Your First Request
                  </button>
                ) : null}
              </div>
            ) : (
              displayed.map((req) => (
                <RequestCard
                  key={req.id}
                  req={req}
                  onApply={setApplyTarget}
                  onViewApplicants={setApplicantsTarget}
                  onClose={handleClose}
                  onDelete={handleDelete}
                />
              ))
            )}
          </div>
        ) : null}

        {/* My Applications */}
        {!loading && tab === 'my-applications' ? (
          <div className="space-y-3">
            {myApplications.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8 text-center">
                <Clock size={28} className="mx-auto mb-3 text-zinc-500" />
                <p className="font-semibold text-zinc-300">No applications yet.</p>
                <p className="mt-1 text-sm text-zinc-500">Browse open requests and apply to collaborate.</p>
              </div>
            ) : (
              myApplications.map((app) => (
                <article key={app.id} className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="font-semibold text-zinc-50">{app.requestTitle || 'Unknown Project'}</h3>
                      <p className="text-xs text-zinc-500">by {app.requestOwner?.split('@')[0] || '—'}</p>
                      {app.message ? (
                        <p className="mt-1.5 text-sm text-zinc-400 italic">"{app.message}"</p>
                      ) : null}
                    </div>
                    <span className={statusBadge(app.status)}>{app.status}</span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    Applied {new Date(app.applied_at).toLocaleDateString()}
                  </p>
                </article>
              ))
            )}
          </div>
        ) : null}
      </div>

      {/* Apply Modal */}
      {applyTarget ? (
        <ApplyModal
          request={applyTarget}
          onClose={() => setApplyTarget(null)}
          onSuccess={() => {
            void Promise.all([loadBrowse(), loadMine(), loadApplications()])
          }}
        />
      ) : null}

      {/* Applicants Drawer */}
      {applicantsTarget ? (
        <ApplicantsDrawer
          requestId={applicantsTarget.id}
          requestTitle={applicantsTarget.title}
          onClose={() => setApplicantsTarget(null)}
        />
      ) : null}
    </div>
  )
}
