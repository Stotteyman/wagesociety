import { useState, useRef } from 'react'
import { authedFetch, getSupabaseBrowserClient } from '../lib/supabaseBrowser'

export function NewsPostForm({ onPost }: { onPost?: () => void }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [embedLinks, setEmbedLinks] = useState('')
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [videoFiles, setVideoFiles] = useState<File[]>([])
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

    const finalImageUrls = imageUrl
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    const finalVideoUrls = videoUrl
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    const finalEmbedLinks = embedLinks
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)

    try {
      for (const file of imageFiles) {
        const uploadedUrl = await uploadFile(file)
        finalImageUrls.push(uploadedUrl)
      }

      for (const file of videoFiles) {
        const uploadedUrl = await uploadFile(file)
        finalVideoUrls.push(uploadedUrl)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.'
      setError(message)
      setLoading(false)
      return
    }

    const res = await authedFetch('/api/news', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body,
        image_urls: finalImageUrls,
        video_urls: finalVideoUrls,
        embed_links: finalEmbedLinks,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to publish blog post')
    } else {
      setTitle('')
      setBody('')
      setImageUrl('')
      setVideoUrl('')
      setEmbedLinks('')
      setImageFiles([])
      setVideoFiles([])
      if (imageInputRef.current) imageInputRef.current.value = ''
      if (videoInputRef.current) videoInputRef.current.value = ''
      if (onPost) onPost()
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-zinc-800 p-6 rounded-lg mb-8">
      <h2 className="text-lg font-semibold mb-4">Write a Blog Post</h2>
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
        <label className="block text-zinc-400 mb-1">Photo files (optional):</label>
        <input
          type="file"
          accept="image/*"
          multiple
          ref={imageInputRef}
          onChange={e => {
            const files = Array.from(e.target.files || [])
            setImageFiles(files)
          }}
          className="block w-full mb-1 p-2 rounded bg-zinc-900 text-zinc-100"
        />
        {imageFiles.length > 0 ? (
          <p className="mb-2 text-xs text-zinc-400">{imageFiles.length} image file(s) selected</p>
        ) : null}
        <input
          className="block w-full p-2 rounded bg-zinc-900 text-zinc-100"
          placeholder="Additional image URLs (comma-separated)"
          value={imageUrl}
          onChange={e => {
            setImageUrl(e.target.value)
          }}
          type="text"
        />
      </div>
      <div className="mb-2">
        <label className="block text-zinc-400 mb-1">Video files (optional):</label>
        <input
          type="file"
          accept="video/*"
          multiple
          ref={videoInputRef}
          onChange={e => {
            const files = Array.from(e.target.files || [])
            setVideoFiles(files)
          }}
          className="block w-full mb-1 p-2 rounded bg-zinc-900 text-zinc-100"
        />
        {videoFiles.length > 0 ? (
          <p className="mb-2 text-xs text-zinc-400">{videoFiles.length} video file(s) selected</p>
        ) : null}
        <input
          className="block w-full p-2 rounded bg-zinc-900 text-zinc-100"
          placeholder="Additional video URLs (comma-separated)"
          value={videoUrl}
          onChange={e => {
            setVideoUrl(e.target.value)
          }}
          type="text"
        />
      </div>
      <div className="mb-4">
        <label className="block text-zinc-400 mb-1">Links to embed (one URL per line)</label>
        <textarea
          className="block w-full p-2 rounded bg-zinc-900 text-zinc-100"
          rows={3}
          placeholder="https://youtube.com/...\nhttps://x.com/..."
          value={embedLinks}
          onChange={(e) => setEmbedLinks(e.target.value)}
        />
      </div>
      <button
        type="submit"
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50"
        disabled={loading}
      >
        {loading ? 'Publishing...' : 'Publish Post'}
      </button>
    </form>
  )
}
