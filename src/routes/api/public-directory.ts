import { createFileRoute } from '@tanstack/react-router'
import {
  assignDeterministicUsernames,
  readAvatarFromMetadata,
  readDisplayNameFromMetadata,
  type AuthUserLike,
} from '../../lib/memberDirectory'
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../lib/supabaseAdmin'
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

type AuthListUserRow = {
  id: string
  email: string | null
  created_at: string
  updated_at?: string
  user_metadata?: Record<string, unknown> | null
  identities?: Array<unknown> | null
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

          if (hasSupabaseAdminConfig()) {
            const admin = getSupabaseAdminClient()
            const users: AuthListUserRow[] = []

            let page = 1
            const perPage = 1000

            while (page <= 10) {
              const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page, perPage })
              if (usersError) {
                return Response.json({ error: usersError.message }, { status: 500 })
              }

              const pageUsers = (usersData?.users || []) as AuthListUserRow[]
              if (!pageUsers.length) break
              users.push(...pageUsers)
              if (pageUsers.length < perPage) break
              page += 1
            }

            const { data: profiles, error: profilesError } = await admin
              .from('org_member_profiles')
              .select('email, display_name, avatar_url, bio')
              .limit(10000)

            if (profilesError && profilesError.code !== '42P01') {
              return Response.json({ error: profilesError.message }, { status: 500 })
            }

            const profileByEmail = new Map(
              (Array.isArray(profiles) ? (profiles as DirectoryProfileRow[]) : []).map((profile) => [
                String(profile.email || '').trim().toLowerCase(),
                profile,
              ]),
            )

            const usernameMap = assignDeterministicUsernames(users as AuthUserLike[])

            const entries = users
              .map((user) => {
                const email = String(user.email || '').trim().toLowerCase()
                if (!email || !user.id) return null

                const profile = profileByEmail.get(email)
                const username = usernameMap.get(String(user.id))
                if (!username) return null

                const displayName =
                  profile?.display_name?.trim() ||
                  readDisplayNameFromMetadata((user.user_metadata as any) || null) ||
                  username

                const entry = {
                  username,
                  displayName,
                  avatarUrl: profile?.avatar_url || readAvatarFromMetadata((user.user_metadata as any) || null),
                  bio: profile?.bio || null,
                  connectedCount: Array.isArray(user.identities) ? user.identities.length : 0,
                }

                if (!q) return entry

                const haystack = `${entry.username} ${entry.displayName} ${entry.bio || ''} ${email}`.toLowerCase()
                return haystack.includes(q) ? entry : null
              })
              .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
              .sort((a, b) => a.username.localeCompare(b.username))
              .slice(0, limit)

            return Response.json({ entries })
          }

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
