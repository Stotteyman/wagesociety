import { useEffect, useState } from 'react'
import { getSupabaseBrowserClient } from '../lib/supabaseBrowser'
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
  image_url?: string
  video_url?: string
}

function NewsSection() {
  const [posts, setPosts] = useState<NewsPost[]>([])
  const [loading, setLoading] = useState(true)

  const fetchPosts = async () => {
    setLoading(true)
    const supabase = getSupabaseBrowserClient()
    const { data, error } = await supabase.from('news').select('*').order('created_at', { ascending: false })
    if (!error && data) setPosts(data)
    setLoading(false)
  }
  useEffect(() => { fetchPosts() }, [])

  // TODO: Optionally fetch user role from /api/me/access if you want to show the post form only for staff/admin
  const canPost = false // Hide post form until role logic is re-implemented

  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">News</h1>
      {/* {canPost && <NewsPostForm onPost={fetchPosts} />} */}
      {loading ? (
        <div>Loading...</div>
      ) : posts.length === 0 ? (
        <div>No news posts yet.</div>
      ) : (
        <ul className="space-y-8">
          {posts.map(post => (
            <li key={post.id} className="bg-zinc-900 rounded-lg p-6 shadow">
              <h2 className="text-xl font-semibold mb-2">{post.title}</h2>
              <div className="text-zinc-400 text-sm mb-2">By {post.author} on {new Date(post.created_at).toLocaleString()}</div>
              {post.image_url && (
                <img src={post.image_url} alt="News" className="mb-4 rounded max-h-64 object-contain" />
              )}
              {post.video_url && (
                <video src={post.video_url} controls className="mb-4 rounded max-h-96 w-full" />
              )}
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
  meta: [{ title: 'News — W.A.G.E. Society' }],
})
