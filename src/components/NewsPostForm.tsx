import { useState, useRef } from 'react'
import { authedFetch, getSupabaseBrowserClient } from '../lib/supabaseBrowser'

export function NewsPostForm({ onPost }: { onPost?: () => void }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uploadFile = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await authedFetch('/api/news-upload', { method: 'POST', body: formData })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Upload failed')
    }
    const data = await res.json()
    return data.url as string
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    let finalImageUrl = imageUrl
    let finalVideoUrl = videoUrl
    try {
      if (imageFile) {
        finalImageUrl = await uploadFile(imageFile)
      }
      if (videoFile) {
        finalVideoUrl = await uploadFile(videoFile)
      }
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
      return
    }
    const formData = new FormData()
    formData.append('title', title)
    formData.append('body', body)
    if (finalImageUrl) formData.append('image_url', finalImageUrl)
    if (finalVideoUrl) formData.append('video_url', finalVideoUrl)
    const res = await authedFetch('/api/news', { method: 'POST', body: formData })
    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to post news')
    } else {
      setTitle('')
      setBody('')
      setImageUrl('')
      setVideoUrl('')
      setImageFile(null)
      setVideoFile(null)
      if (imageInputRef.current) imageInputRef.current.value = ''
      if (videoInputRef.current) videoInputRef.current.value = ''
      if (onPost) onPost()
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-zinc-800 p-6 rounded-lg mb-8">
      <h2 className="text-lg font-semibold mb-4">Create News Post</h2>
      {error && <div className="text-red-400 mb-2">{error}</div>}
      <input
        className="block w-full mb-2 p-2 rounded bg-zinc-900 text-zinc-100"
        placeholder="Title"
        value={title}
        onChange={e => setTitle(e.target.value)}
        required
      />
      <textarea
        className="block w-full mb-2 p-2 rounded bg-zinc-900 text-zinc-100"
        placeholder="Body"
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={4}
        required
      />
      <div className="mb-2">
        <label className="block text-zinc-400 mb-1">Image (optional):</label>
        <input
          type="file"
          accept="image/*"
          ref={imageInputRef}
          onChange={e => {
            const file = e.target.files?.[0]
            setImageFile(file || null)
            setImageUrl('')
          }}
          className="block w-full mb-1 p-2 rounded bg-zinc-900 text-zinc-100"
        />
        <input
          className="block w-full p-2 rounded bg-zinc-900 text-zinc-100"
          placeholder="Image URL (optional)"
          value={imageUrl}
          onChange={e => {
            setImageUrl(e.target.value)
            setImageFile(null)
          }}
          type="url"
        />
      </div>
      <div className="mb-2">
        <label className="block text-zinc-400 mb-1">Video (optional):</label>
        <input
          type="file"
          accept="video/*"
          ref={videoInputRef}
          onChange={e => {
            const file = e.target.files?.[0]
            setVideoFile(file || null)
            setVideoUrl('')
          }}
          className="block w-full mb-1 p-2 rounded bg-zinc-900 text-zinc-100"
        />
        <input
          className="block w-full p-2 rounded bg-zinc-900 text-zinc-100"
          placeholder="Video URL (optional)"
          value={videoUrl}
          onChange={e => {
            setVideoUrl(e.target.value)
            setVideoFile(null)
          }}
          type="url"
        />
      </div>
      <button
        type="submit"
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50"
        disabled={loading}
      >
        {loading ? 'Posting...' : 'Post News'}
      </button>
    </form>
  )
}
