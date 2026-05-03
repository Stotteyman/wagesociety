import { createFileRoute } from '@tanstack/react-router'
import { getSupabaseServerPublicClient } from '../../lib/supabaseServer'

type DirectoryRow = {
  username: string
  display_name: string
  avatar_url: string | null
  bio: string | null
  connected_count: number
}

type DirectoryProfileRow = {
  email: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
}

function normalizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const Route = createFileRoute('/api/public-directory')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const q = (url.searchParams.get('q') || '').trim().toLowerCase()
          const limitParam = Number(url.searchParams.get('limit') || '200')
          const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(500, Math.floor(limitParam))) : 200

          const client = getSupabaseServerPublicClient()
          // @ts-expect-error New RPC may exist before generated DB types are refreshed.
          const { data, error } = await client.rpc('list_public_directory', {
            p_limit: limit,
            p_query: q || null,
          })

          if (!error) {
            const entries = (Array.isArray(data) ? (data as DirectoryRow[]) : []).map((row) => ({
              username: row.username,
              displayName: row.display_name,
              avatarUrl: row.avatar_url,
              bio: row.bio,
              connectedCount: row.connected_count,
            }))

            return Response.json({ entries })
          }

          const { data: profiles, error: profilesError } = await client
            .from('org_member_profiles')
            .select('email, display_name, avatar_url, bio')
            .order('updated_at', { ascending: false })
            .limit(5000)

          if (profilesError) {
            return Response.json({ error: profilesError.message }, { status: 500 })
          }

          const entries = (Array.isArray(profiles) ? (profiles as DirectoryProfileRow[]) : [])
            .map((row) => {
              const email = String(row.email || '').trim().toLowerCase()
              if (!email) return null

              const rawUsername = row.display_name?.trim() || email.split('@')[0] || ''
              const username = normalizeUsername(rawUsername)
              if (!username) return null

              return {
                username,
                displayName: row.display_name?.trim() || username,
                avatarUrl: row.avatar_url,
                bio: row.bio,
                connectedCount: 0,
              }
            })
            .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
            .filter((entry) => {
              if (!q) return true
              const haystack = `${entry.username} ${entry.displayName} ${entry.bio || ''}`.toLowerCase()
              return haystack.includes(q)
            })
            .sort((a, b) => a.username.localeCompare(b.username))
            .slice(0, limit)

          return Response.json({ entries })
        } catch (error) {
          if (error instanceof Error) {
            console.error('[public-directory] failed to load directory', error.message)
          }
          return Response.json(
            { error: error instanceof Error ? error.message : 'Could not load directory right now.' },
            { status: 500 },
          )
        }
      },
    },
  },
})
