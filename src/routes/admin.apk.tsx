import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { authedFetch } from '../lib/supabaseBrowser'
import { requireAuthenticatedRoute } from '../lib/routeAuth'

type ApkRelease = {
  version: string
  notes?: string
  uploadedAt: string
  uploadedBy?: string
  fileName: string
  fileSizeBytes: number
  url: string
}

export const Route = createFileRoute('/admin/apk')({
  beforeLoad: async () => {
    await requireAuthenticatedRoute()
  },
  head: () => ({
    meta: [{ title: 'APK Release Manager — W.A.G.E. Society' }],
  }),
  component: AdminApkPage,
})

function AdminApkPage() {
  const [file, setFile] = useState<File | null>(null)
  const [version, setVersion] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [latest, setLatest] = useState<ApkRelease | null>(null)

  const loadLatest = async () => {
    setError('')
    try {
      const res = await authedFetch('/api/admin/apk-release')
      const data = (await res.json()) as { release?: ApkRelease | null; error?: string }
      if (!res.ok) {
        setError(data.error || 'Failed to load latest release metadata.')
        return
      }
      setLatest(data.release || null)
    } catch {
      setError('Failed to load latest release metadata.')
    }
  }

  useEffect(() => {
    void loadLatest()
  }, [])

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!file) {
      setError('Please choose an APK file.')
      return
    }

    if (!version.trim()) {
      setError('Please provide a release version (e.g. 1.0.7).')
      return
    }

    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('version', version.trim())
      form.append('notes', notes.trim())

      const res = await authedFetch('/api/admin/apk-release', {
        method: 'POST',
        body: form,
      })

      const data = (await res.json()) as { release?: ApkRelease; error?: string }
      if (!res.ok || !data.release) {
        setError(data.error || 'Upload failed.')
        return
      }

      setLatest(data.release)
      setSuccess('APK uploaded and latest download metadata updated successfully.')
      setFile(null)
      setVersion('')
      setNotes('')
    } catch {
      setError('Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen px-4 py-12 text-zinc-100">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Admin / Mobile</p>
          <h1 className="mt-2 text-3xl font-black text-zinc-50">Android APK Release Manager</h1>
          <p className="mt-2 text-zinc-300">
            Upload a new APK and this immediately updates the Download page without redeploying the website.
          </p>
        </header>

        <section className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
          <h2 className="text-lg font-bold text-zinc-50">Current Live APK</h2>
          {latest ? (
            <div className="mt-3 space-y-1 text-sm text-zinc-300">
              <p><span className="text-zinc-400">Version:</span> {latest.version}</p>
              <p><span className="text-zinc-400">File:</span> {latest.fileName}</p>
              <p><span className="text-zinc-400">Uploaded:</span> {new Date(latest.uploadedAt).toLocaleString()}</p>
              <p><span className="text-zinc-400">Size:</span> {(latest.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB</p>
              <a href={latest.url} target="_blank" rel="noreferrer" className="text-orange-200 hover:text-orange-100">
                Open current APK URL
              </a>
            </div>
          ) : (
            <p className="mt-2 text-sm text-zinc-400">No uploaded APK metadata found yet.</p>
          )}
        </section>

        <form onSubmit={handleUpload} className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 space-y-4">
          <h2 className="text-lg font-bold text-zinc-50">Upload New APK</h2>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Release Version</label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g. 1.0.7"
              className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/50 px-3 py-2 text-sm text-zinc-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Release Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/50 px-3 py-2 text-sm text-zinc-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">APK File</label>
            <input
              type="file"
              accept=".apk,application/vnd.android.package-archive"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/50 px-3 py-2 text-sm text-zinc-100"
            />
          </div>

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-300">{success}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-orange-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70"
          >
            {busy ? 'Uploading...' : 'Upload and Publish APK'}
          </button>
        </form>
      </div>
    </div>
  )
}
