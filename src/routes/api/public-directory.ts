import { createFileRoute } from '@tanstack/react-router'
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin'

type AuthUserMeta = {
  username?: string
  full_name?: string
  name?: string
  preferred_username?: string
  picture?: string
  avatar_url?: string
}

type DirectoryIdentityRow = {
  user_id: string
  provider: string
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase()
}

function readUsernameFromMeta(meta: AuthUserMeta | null | undefined) {
  const candidates = [meta?.username, meta?.preferred_username, meta?.full_name, meta?.name]
  for (const candidate of candidates) {
    const trimmed = candidate?.trim()
    if (trimmed) return trimmed
  }
  return null
}

function readAvatarFromMeta(meta: AuthUserMeta | null | undefined) {
  const candidates = [meta?.avatar_url, meta?.picture]
  for (const candidate of candidates) {
    const trimmed = candidate?.trim()
    if (trimmed) return trimmed
  }
  return null
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

          const admin = getSupabaseAdminClient()
          const [{ data: users, error: usersError }, { data: profiles, error: profilesError }, { data: identities, error: identitiesError }] = await Promise.all([
            admin
              .schema('auth')
              .from('users')
              .select('id, email, raw_user_meta_data')
              .limit(5000),
            admin
              .from('org_member_profiles')
              .select('email, display_name, avatar_url, bio')
              .limit(5000),
            admin
              .schema('auth')
              .from('identities')
              .select('user_id, provider')
              .limit(10000),
          ])

          if (usersError) {
            return Response.json({ error: usersError.message }, { status: 500 })
          }
          if (profilesError && profilesError.code !== '42P01') {
            return Response.json({ error: profilesError.message }, { status: 500 })
          }
          if (identitiesError) {
            return Response.json({ error: identitiesError.message }, { status: 500 })
          }

          const profileByEmail = new Map<string, { display_name: string | null; avatar_url: string | null; bio: string | null }>()
          for (const row of Array.isArray(profiles) ? profiles : []) {
            const email = String(row.email || '').toLowerCase()
            if (!email) continue
            profileByEmail.set(email, {
              display_name: row.display_name,
              avatar_url: row.avatar_url,
              bio: row.bio,
            })
          }

          const identityCountByUserId = new Map<string, number>()
          for (const row of Array.isArray(identities) ? (identities as DirectoryIdentityRow[]) : []) {
            identityCountByUserId.set(row.user_id, (identityCountByUserId.get(row.user_id) || 0) + 1)
          }

          const entries = (Array.isArray(users) ? users : [])
            .map((row) => {
              const userId = String(row.id || '')
              const email = String(row.email || '').toLowerCase()
              if (!userId || !email) return null

              const meta = (row.raw_user_meta_data as AuthUserMeta | null | undefined) ?? null
              const username = readUsernameFromMeta(meta)
              if (!username) return null

              const normalized = normalizeUsername(username)
              const profile = profileByEmail.get(email)

              const displayName =
                profile?.display_name || username

              const bio = profile?.bio || null
              const avatarUrl = profile?.avatar_url || readAvatarFromMeta(meta)
              const connectedCount = identityCountByUserId.get(userId) || 0

              return {
                username: normalized,
                displayName,
                avatarUrl,
                bio,
                connectedCount,
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
          return Response.json({ error: 'Could not load directory right now.' }, { status: 500 })
        }
      },
    },
  },
})
