import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { requireAuthenticatedRoute } from '../lib/routeAuth'
import { authedFetch } from '../lib/supabaseBrowser'

type SubmissionTarget = 'personal_store' | 'wage_shop'
type SubmissionStatus = 'submitted' | 'under_review' | 'accepted' | 'denied'

type MerchSubmission = {
  id: string
  creatorEmail: string
  title: string
  description: string
  submissionTarget: SubmissionTarget
  mediaUrls: string[]
  embedLinks: string[]
  externalStoreUrl?: string | null
  status: SubmissionStatus
  adminNotes?: string | null
  creatorSplitPercent: number
  wageSplitPercent: number
  approvedBy?: string | null
  approvedAt?: string | null
  createdAt: string
  updatedAt: string
}

type MerchEarning = {
  id: string
  submissionId: string
  recordedBy: string
  periodStart?: string | null
  periodEnd?: string | null
  grossCents: number
  memberDueCents: number
  wageDueCents: number
  paidToMemberCents: number
  paidToWageCents: number
  notes?: string | null
  createdAt: string
  updatedAt: string
}

type EarningsSummary = {
  memberDueCents: number
  memberPaidCents: number
  memberPendingCents: number
}

function centsToUsd(value: number) {
  return `$${(value / 100).toFixed(2)}`
}

function parseLines(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function looksLikeImage(url: string) {
  return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url)
}

function looksLikeVideo(url: string) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)
}

export const Route = createFileRoute('/merch-studio')({
  beforeLoad: async () => {
    await requireAuthenticatedRoute('/login')
  },
  head: () => ({
    meta: [
      { title: 'Merch Studio — W.A.G.E. Society' },
      {
        name: 'description',
        content:
          'Submit merch concepts, track approvals, and monitor creator payouts in the W.A.G.E. Society Merch Studio.',
      },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: MerchStudioPage,
})

export function MerchStudioPage() {
  const [submissions, setSubmissions] = useState<MerchSubmission[]>([])
  const [earnings, setEarnings] = useState<MerchEarning[]>([])
  const [summary, setSummary] = useState<EarningsSummary>({
    memberDueCents: 0,
    memberPaidCents: 0,
    memberPendingCents: 0,
  })
  const [canReview, setCanReview] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [savingReviewId, setSavingReviewId] = useState<string | null>(null)
  const [recordingEarnings, setRecordingEarnings] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submissionTarget, setSubmissionTarget] = useState<SubmissionTarget>('wage_shop')
  const [externalStoreUrl, setExternalStoreUrl] = useState('')
  const [manualMediaLinks, setManualMediaLinks] = useState('')
  const [embedLinks, setEmbedLinks] = useState('')
  const [files, setFiles] = useState<File[]>([])

  const [reviewStatus, setReviewStatus] = useState<Record<string, SubmissionStatus>>({})
  const [reviewCreatorSplit, setReviewCreatorSplit] = useState<Record<string, number>>({})
  const [reviewWageSplit, setReviewWageSplit] = useState<Record<string, number>>({})
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})
  const [grossInputs, setGrossInputs] = useState<Record<string, string>>({})

  const sortedSubmissions = useMemo(
    () => [...submissions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [submissions],
  )

  const loadData = async () => {
    setLoading(true)
    setError('')

    try {
      const [submissionsRes, earningsRes] = await Promise.all([
        authedFetch('/api/merch-studio/submissions'),
        authedFetch('/api/merch-studio/earnings'),
      ])

      const submissionsData = (await submissionsRes.json()) as
        | { error?: string; submissions?: MerchSubmission[]; canReview?: boolean }
        | undefined
      const earningsData = (await earningsRes.json()) as
        | { error?: string; earnings?: MerchEarning[]; summary?: EarningsSummary }
        | undefined

      if (!submissionsRes.ok) {
        setError(submissionsData?.error || 'Failed to load merch submissions.')
        setSubmissions([])
      } else {
        setSubmissions(submissionsData?.submissions || [])
        setCanReview(Boolean(submissionsData?.canReview))
      }

      if (!earningsRes.ok) {
        if (!submissionsRes.ok) {
          setError(
            submissionsData?.error || earningsData?.error || 'Failed to load Merch Studio data.',
          )
        }
        setEarnings([])
        setSummary({ memberDueCents: 0, memberPaidCents: 0, memberPendingCents: 0 })
      } else {
        setEarnings(earningsData?.earnings || [])
        setSummary(
          earningsData?.summary || {
            memberDueCents: 0,
            memberPaidCents: 0,
            memberPendingCents: 0,
          },
        )
      }
    } catch {
      setError('Failed to load Merch Studio data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const uploadFiles = async (fileList: File[]) => {
    const uploaded: string[] = []

    for (const file of fileList) {
      const form = new FormData()
      form.append('file', file)

      const response = await authedFetch('/api/merch-studio/upload', {
        method: 'POST',
        body: form,
      })

      const data = (await response.json()) as { error?: string; url?: string }
      if (!response.ok || !data.url) {
        throw new Error(data.error || `Upload failed for ${file.name}`)
      }

      uploaded.push(data.url)
    }

    return uploaded
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setNotice('')

    try {
      const uploadedUrls = await uploadFiles(files)
      const manualUrls = parseLines(manualMediaLinks)
      const externalUrl = externalStoreUrl.trim()

      const response = await authedFetch('/api/merch-studio/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          submissionTarget,
          externalStoreUrl: externalUrl,
          mediaUrls: [...uploadedUrls, ...manualUrls],
          embedLinks: parseLines(embedLinks),
        }),
      })

      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        setError(data.error || 'Unable to submit merch concept.')
        return
      }

      setTitle('')
      setDescription('')
      setSubmissionTarget('wage_shop')
      setExternalStoreUrl('')
      setManualMediaLinks('')
      setEmbedLinks('')
      setFiles([])
      setNotice('Merch concept submitted. Admin review is now pending.')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit merch concept.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAdminReview = async (submission: MerchSubmission) => {
    const creatorSplit = reviewCreatorSplit[submission.id] ?? submission.creatorSplitPercent
    const wageSplit = reviewWageSplit[submission.id] ?? submission.wageSplitPercent
    const status = reviewStatus[submission.id] ?? submission.status
    const adminNotes = reviewNotes[submission.id] ?? submission.adminNotes ?? ''

    setSavingReviewId(submission.id)
    setError('')
    setNotice('')

    try {
      const response = await authedFetch('/api/merch-studio/submissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: submission.id,
          status,
          adminNotes,
          creatorSplitPercent: creatorSplit,
          wageSplitPercent: wageSplit,
        }),
      })

      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        setError(data.error || 'Failed to save review decision.')
        return
      }

      setNotice('Review decision saved.')
      await loadData()
    } catch {
      setError('Failed to save review decision.')
    } finally {
      setSavingReviewId(null)
    }
  }

  const handleRecordEarnings = async (submissionId: string) => {
    const grossInput = grossInputs[submissionId] || ''
    const grossCents = Math.round(Number(grossInput) * 100)

    if (!Number.isFinite(grossCents) || grossCents < 0) {
      setError('Gross revenue must be a valid non-negative dollar amount.')
      return
    }

    setRecordingEarnings(submissionId)
    setError('')
    setNotice('')

    try {
      const response = await authedFetch('/api/merch-studio/earnings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId,
          grossCents,
        }),
      })

      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        setError(data.error || 'Failed to record earnings.')
        return
      }

      setGrossInputs((prev) => ({ ...prev, [submissionId]: '' }))
      setNotice('Earnings recorded.')
      await loadData()
    } catch {
      setError('Failed to record earnings.')
    } finally {
      setRecordingEarnings(null)
    }
  }

  return (
    <div className="mx-auto mt-6 w-full max-w-6xl space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-200">Merch Studio</p>
        <h1 className="mt-2 text-2xl font-black text-zinc-50 sm:text-3xl">Creator mockups, admin review, and payout tracking.</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-300">
          Submit mockups, 3D renders, product links, and embeds for WAGE Shop or your personal store. Admins can accept or deny submissions, assign split percentages, and record payouts over time.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">Member Due</p>
          <p className="mt-1 text-2xl font-bold text-emerald-300">{centsToUsd(summary.memberDueCents)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">Member Paid</p>
          <p className="mt-1 text-2xl font-bold text-blue-300">{centsToUsd(summary.memberPaidCents)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">Member Pending</p>
          <p className="mt-1 text-2xl font-bold text-orange-200">{centsToUsd(summary.memberPendingCents)}</p>
        </div>
      </section>

      {error ? <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">{error}</p> : null}
      {notice ? <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">{notice}</p> : null}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 sm:p-6">
        <h2 className="text-xl font-bold text-zinc-50">Submit A Merch Concept</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
            required
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe your design, target audience, and product concept"
            className="h-32 w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
            required
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-zinc-300">
              <span className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-400">Submission target</span>
              <select
                value={submissionTarget}
                onChange={(event) => setSubmissionTarget(event.target.value as SubmissionTarget)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="wage_shop">WAGE Shop</option>
                <option value="personal_store">Personal Store</option>
              </select>
            </label>
            <label className="text-sm text-zinc-300">
              <span className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-400">External store URL</span>
              <input
                type="url"
                value={externalStoreUrl}
                onChange={(event) => setExternalStoreUrl(event.target.value)}
                placeholder="https://"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
          </div>

          <label className="block text-sm text-zinc-300">
            <span className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-400">Upload media files</span>
            <input
              type="file"
              multiple
              accept="image/*,video/*,.obj,.fbx,.glb,.gltf,.stl"
              onChange={(event) => setFiles(Array.from(event.target.files || []))}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
            />
          </label>

          <textarea
            value={manualMediaLinks}
            onChange={(event) => setManualMediaLinks(event.target.value)}
            placeholder="Additional media URLs (one per line)"
            className="h-24 w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
          />

          <textarea
            value={embedLinks}
            onChange={(event) => setEmbedLinks(event.target.value)}
            placeholder="Embeds/links (YouTube, product page, inspiration links - one per line)"
            className="h-24 w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
          />

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70"
          >
            {submitting ? 'Submitting...' : 'Submit Concept'}
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-zinc-50">Submissions</h2>
        {loading ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-300">Loading submissions...</div>
        ) : sortedSubmissions.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-300">No merch submissions yet.</div>
        ) : (
          sortedSubmissions.map((submission) => {
            const relatedEarnings = earnings.filter((entry) => entry.submissionId === submission.id)

            return (
              <article key={submission.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-zinc-50">{submission.title}</h3>
                    <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">
                      {submission.submissionTarget === 'wage_shop' ? 'WAGE Shop' : 'Personal Store'} | {submission.status}
                    </p>
                  </div>
                  <p className="text-xs text-zinc-400">Submitted {new Date(submission.createdAt).toLocaleString()}</p>
                </div>

                <p className="mt-3 whitespace-pre-line text-sm text-zinc-200">{submission.description}</p>

                {submission.externalStoreUrl ? (
                  <p className="mt-3 text-sm text-zinc-300">
                    External store:{' '}
                    <a href={submission.externalStoreUrl} target="_blank" rel="noreferrer" className="text-blue-300 underline">
                      {submission.externalStoreUrl}
                    </a>
                  </p>
                ) : null}

                {submission.mediaUrls.length > 0 ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {submission.mediaUrls.map((url) => (
                      <div key={url} className="rounded-lg border border-zinc-700 bg-zinc-950/50 p-2">
                        {looksLikeImage(url) ? <img src={url} alt={submission.title} className="h-44 w-full rounded object-cover" /> : null}
                        {looksLikeVideo(url) ? <video src={url} controls className="h-44 w-full rounded object-cover" /> : null}
                        {!looksLikeImage(url) && !looksLikeVideo(url) ? (
                          <a href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-300 underline break-all">
                            {url}
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {submission.embedLinks.length > 0 ? (
                  <ul className="mt-4 space-y-2 text-sm">
                    {submission.embedLinks.map((link) => (
                      <li key={link}>
                        <a href={link} target="_blank" rel="noreferrer" className="text-blue-300 underline break-all">
                          {link}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-zinc-700 bg-zinc-950/50 p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">Creator Split</p>
                    <p className="mt-1 text-sm font-semibold text-zinc-100">{submission.creatorSplitPercent}%</p>
                  </div>
                  <div className="rounded-lg border border-zinc-700 bg-zinc-950/50 p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">WAGE Split</p>
                    <p className="mt-1 text-sm font-semibold text-zinc-100">{submission.wageSplitPercent}%</p>
                  </div>
                  <div className="rounded-lg border border-zinc-700 bg-zinc-950/50 p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">Total Member Due</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-300">
                      {centsToUsd(relatedEarnings.reduce((acc, item) => acc + item.memberDueCents, 0))}
                    </p>
                  </div>
                  <div className="rounded-lg border border-zinc-700 bg-zinc-950/50 p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">Pending Member</p>
                    <p className="mt-1 text-sm font-semibold text-orange-200">
                      {centsToUsd(
                        relatedEarnings.reduce(
                          (acc, item) => acc + Math.max(0, item.memberDueCents - item.paidToMemberCents),
                          0,
                        ),
                      )}
                    </p>
                  </div>
                </div>

                {canReview ? (
                  <div className="mt-5 space-y-3 rounded-xl border border-zinc-700 bg-zinc-950/60 p-4">
                    <h4 className="text-sm font-bold uppercase tracking-[0.12em] text-zinc-300">Admin Review</h4>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="text-xs text-zinc-300">
                        <span className="mb-1 block uppercase tracking-[0.12em] text-zinc-400">Status</span>
                        <select
                          value={reviewStatus[submission.id] ?? submission.status}
                          onChange={(event) =>
                            setReviewStatus((prev) => ({
                              ...prev,
                              [submission.id]: event.target.value as SubmissionStatus,
                            }))
                          }
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-100"
                        >
                          <option value="submitted">submitted</option>
                          <option value="under_review">under_review</option>
                          <option value="accepted">accepted</option>
                          <option value="denied">denied</option>
                        </select>
                      </label>

                      <label className="text-xs text-zinc-300">
                        <span className="mb-1 block uppercase tracking-[0.12em] text-zinc-400">Creator %</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.1"
                          value={reviewCreatorSplit[submission.id] ?? submission.creatorSplitPercent}
                          onChange={(event) =>
                            setReviewCreatorSplit((prev) => ({
                              ...prev,
                              [submission.id]: Number(event.target.value),
                            }))
                          }
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-100"
                        />
                      </label>

                      <label className="text-xs text-zinc-300">
                        <span className="mb-1 block uppercase tracking-[0.12em] text-zinc-400">WAGE %</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.1"
                          value={reviewWageSplit[submission.id] ?? submission.wageSplitPercent}
                          onChange={(event) =>
                            setReviewWageSplit((prev) => ({
                              ...prev,
                              [submission.id]: Number(event.target.value),
                            }))
                          }
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-100"
                        />
                      </label>

                      <label className="text-xs text-zinc-300">
                        <span className="mb-1 block uppercase tracking-[0.12em] text-zinc-400">Gross $</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={grossInputs[submission.id] ?? ''}
                          onChange={(event) =>
                            setGrossInputs((prev) => ({
                              ...prev,
                              [submission.id]: event.target.value,
                            }))
                          }
                          placeholder="0.00"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-100"
                        />
                      </label>
                    </div>

                    <textarea
                      value={reviewNotes[submission.id] ?? submission.adminNotes ?? ''}
                      onChange={(event) =>
                        setReviewNotes((prev) => ({
                          ...prev,
                          [submission.id]: event.target.value,
                        }))
                      }
                      placeholder="Admin notes"
                      className="h-20 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                    />

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleAdminReview(submission)}
                        disabled={savingReviewId === submission.id}
                        className="rounded-lg bg-orange-300 px-3 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-70"
                      >
                        {savingReviewId === submission.id ? 'Saving...' : 'Save Review'}
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleRecordEarnings(submission.id)}
                        disabled={recordingEarnings === submission.id}
                        className="rounded-lg border border-zinc-500 px-3 py-2 text-sm font-semibold text-zinc-100 disabled:opacity-70"
                      >
                        {recordingEarnings === submission.id ? 'Recording...' : 'Record Earnings'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            )
          })
        )}
      </section>
    </div>
  )
}
