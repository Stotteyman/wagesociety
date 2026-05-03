import { useEffect, useState } from 'react'
import { authedFetch, getSupabaseBrowserClient } from '../lib/supabaseBrowser'
import { NewsPostForm } from '../components/NewsPostForm'
// import { useAccess } from '../routes/dashboard'
import { createFileRoute } from '@tanstack/react-router'

// News post type
type NewsPost = {
  id: string
  title: string
  body: string
  created_at: string
  author: string
  image_urls?: string[]
  video_urls?: string[]
  embed_links?: string[]
}

type AccessResponse = {
  role: string
  permissions: string[]
}

function isEmbeddableVideo(url: string) {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    if (host.includes('youtube.com') || host === 'youtu.be') return true
    if (host.includes('vimeo.com')) return true
    return false
  } catch {
    return false
  }
}

function toEmbedUrl(url: string) {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()

    if (host.includes('youtube.com')) {
      const id = parsed.searchParams.get('v')
      if (id) return `https://www.youtube.com/embed/${id}`
    }

    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0]
      if (id) return `https://www.youtube.com/embed/${id}`
    }

    if (host.includes('vimeo.com')) {
      const id = parsed.pathname.split('/').filter(Boolean)[0]
      if (id) return `https://player.vimeo.com/video/${id}`
    }

    return null
  } catch {
    return null
  }
}

function NewsSection() {
  const [posts, setPosts] = useState<NewsPost[]>([])
  const [loading, setLoading] = useState(true)
  const [canPost, setCanPost] = useState(false)

  const fetchPosts = async () => {
    setLoading(true)
    const response = await fetch('/api/news')
    const data = (await response.json()) as NewsPost[] | { error?: string }
    if (response.ok && Array.isArray(data)) {
      setPosts(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    void fetchPosts()
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data } = await supabase.auth.getSession()
        if (!data.session) {
          setCanPost(false)
          return
        }

        const response = await authedFetch('/api/me/access')
        if (!response.ok) {
          setCanPost(false)
          return
        }

        const access = (await response.json()) as AccessResponse
        const allowedRoles = new Set(['superadmin', 'admin', 'manager', 'staff', 'helper', 'user'])
        setCanPost(allowedRoles.has(access.role) && access.role !== 'banned' && access.permissions.includes('view_creator_tools'))
      } catch {
        setCanPost(false)
      }
    })()
  }, [])


  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Blog</h1>
      {canPost && <NewsPostForm onPost={() => void fetchPosts()} />}
      {loading ? (
        <div>Loading...</div>
      ) : posts.length === 0 ? (
        <div>No blog posts yet.</div>
      ) : (
        <ul className="space-y-8">
          {posts.map(post => (
            <li key={post.id} className="bg-zinc-900 rounded-lg p-6 shadow">
              <h2 className="text-xl font-semibold mb-2">{post.title}</h2>
              <div className="text-zinc-400 text-sm mb-2">By {post.author} on {new Date(post.created_at).toLocaleString()}</div>
              {(post.image_urls || []).map((url) => (
                <img key={url} src={url} alt="Blog" className="mb-4 rounded max-h-64 object-contain" />
              ))}
              {(post.video_urls || []).map((url) => (
                <video key={url} src={url} controls className="mb-4 rounded max-h-96 w-full" />
              ))}
              {(post.embed_links || []).length > 0 ? (
                <div className="mb-4 space-y-2 rounded-md border border-zinc-700 bg-zinc-950/60 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-400">Attached links</p>
                  <ul className="space-y-2 text-sm">
                    {(post.embed_links || []).map((link) => (
                      <li key={link}>
                        <a href={link} target="_blank" rel="noreferrer" className="text-blue-300 hover:text-blue-200 underline break-all">
                          {link}
                        </a>
                        {isEmbeddableVideo(link) ? (
                          <iframe
                            src={toEmbedUrl(link) || link}
                            className="mt-2 h-52 w-full rounded border border-zinc-700"
                            title={`Embedded media for ${post.title}`}
                            loading="lazy"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="whitespace-pre-line text-zinc-200">{post.body}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export const Route = createFileRoute('/news')({
  component: NewsSection,
  head: () => ({
    meta: [{ title: 'News — W.A.G.E. Society' }],
  }),
})
