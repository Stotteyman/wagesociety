import { createFileRoute } from '@tanstack/react-router'
import {
  assignDeterministicUsernames,
  normalizeMemberUsername,
  readAvatarFromMetadata,
  readDisplayNameFromMetadata,
  type AuthUserLike,
} from '../../lib/memberDirectory'
import { listAuthIndexedUsers } from '../../lib/authUserIndex'
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../lib/supabaseAdmin'
import { getSupabaseServerClientForToken } from '../../lib/supabaseServer'

type DirectoryProfileRow = {
  email: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
}

type RoleEmailRow = {
  email: string
}

type AuthListUserRow = {
  id: string
  email: string | null
  created_at: string
  updated_at?: string
  user_metadata?: Record<string, unknown> | null
}

function normalizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) return undefined
  const token = authHeader.slice(7).trim()
  return token || undefined
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

          const client = hasSupabaseAdminConfig()
            ? getSupabaseAdminClient()
            : getSupabaseServerClientForToken(getBearerToken(request))
          let users = await listAuthIndexedUsers(client)

          if (users.length === 0 && hasSupabaseAdminConfig()) {
            const admin = getSupabaseAdminClient()
            const collected: AuthListUserRow[] = []
            let page = 1
            const perPage = 1000

            while (page <= 10) {
              const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page, perPage })
              if (usersError) break
              const pageUsers = (usersData?.users || []) as AuthListUserRow[]
              if (!pageUsers.length) break
              collected.push(...pageUsers)
              if (pageUsers.length < perPage) break
              page += 1
            }

            users = collected.map((row) => ({
              id: row.id,
              email: row.email,
              user_metadata: row.user_metadata || null,
              created_at: row.created_at,
              updated_at: row.updated_at || row.created_at,
              identities: null,
            }))
          }

          const { data: profiles, error: profilesError } = await client
            .from('org_member_profiles')
            .select('email, display_name, avatar_url, bio')
            .limit(10000)

          if (profilesError) {
            return Response.json({ error: profilesError.message }, { status: 500 })
          }

          const profileRows = Array.isArray(profiles) ? (profiles as DirectoryProfileRow[]) : []
          const profileByEmail = new Map(profileRows.map((row) => [String(row.email || '').trim().toLowerCase(), row]))

          const usernameMap = assignDeterministicUsernames(users as AuthUserLike[])

          let entries = users
            .map((user) => {
              const email = String(user.email || '').trim().toLowerCase()
              if (!email || !user.id) return null

              const profile = profileByEmail.get(email)
              const profileUsername = normalizeMemberUsername(profile?.display_name || '')
              const username = profileUsername || usernameMap.get(String(user.id))
              if (!username) return null

              const displayName =
                profile?.display_name?.trim() ||
                readDisplayNameFromMetadata((user.user_metadata as any) || null) ||
                username

              // Count connected providers from metadata and identities
              // Metadata includes: kick_username, selected_youtube_channel, twitch_username, youtube_handle
              const metadata = (user.user_metadata as Record<string, unknown>) || {}
              const connectedProviders = new Set<string>()
              
              if (metadata.kick_username) connectedProviders.add('kick')
              if (metadata.selected_youtube_channel) connectedProviders.add('youtube')
              if (metadata.twitch_username) connectedProviders.add('twitch')
              if (metadata.youtube_handle) connectedProviders.add('youtube')
              
              // Also count from identities if available (includes google, discord, apple, facebook)
              const identities = Array.isArray(user.identities) ? user.identities : []
              for (const identity of identities) {
                const provider = String(identity?.provider || '').trim().toLowerCase()
                if (provider && provider !== 'email') {
                  connectedProviders.add(provider)
                }
              }

              return {
                username,
                displayName,
                avatarUrl: profile?.avatar_url || readAvatarFromMetadata((user.user_metadata as any) || null),
                bio: profile?.bio || null,
                connectedCount: connectedProviders.size,
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

          if (entries.length === 0) {
            const { data: roleEmails } = await client.from('org_user_roles').select('email').limit(10000)
            const roleRows = Array.isArray(roleEmails) ? (roleEmails as RoleEmailRow[]) : []
            const allEmails = new Set<string>()

            for (const profile of profileRows) {
              const email = String(profile.email || '').trim().toLowerCase()
              if (email) allEmails.add(email)
            }

            for (const roleRow of roleRows) {
              const email = String(roleRow.email || '').trim().toLowerCase()
              if (email) allEmails.add(email)
            }

            entries = Array.from(allEmails)
              .map((email) => {
                const profile = profileByEmail.get(email)
                const rawUsername = profile?.display_name?.trim() || email.split('@')[0] || ''
                const username = normalizeUsername(rawUsername)
                if (!username) return null

                // For fallback, we don't have user_id, so connectedCount will be 0
                // This is a fallback path and should rarely be used
                return {
                  username,
                  displayName: profile?.display_name?.trim() || username,
                  avatarUrl: profile?.avatar_url || null,
                  bio: profile?.bio || null,
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
          }

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
