/**
 * Username availability check — public endpoint, no auth required.
 *
 * GET /api/check-username?username=xxx
 * Returns { available: boolean, username: string }
 *
 * Rules enforced server-side:
 *   - 3–20 characters
 *   - Only letters, numbers, underscores, and hyphens
 *   - Case-insensitive uniqueness against org_member_profiles.display_name
 */
import { createFileRoute } from '@tanstack/react-router'
import { listAuthIndexedUsers } from '../../lib/authUserIndex'
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../lib/supabaseAdmin'
import { getSupabaseServerPublicClient } from '../../lib/supabaseServer'

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/

type AuthUserMeta = {
  username?: string
  preferred_username?: string
}

export const Route = createFileRoute('/api/check-username')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const username = (url.searchParams.get('username') ?? '').trim()
        const currentEmail = (url.searchParams.get('currentEmail') ?? '').trim().toLowerCase()

        if (!USERNAME_REGEX.test(username)) {
          return Response.json(
            {
              available: false,
              username,
              reason: 'Username must be 3–20 characters and contain only letters, numbers, underscores, or hyphens.',
            },
            { status: 200 },
          )
        }

        try {
          const client = hasSupabaseAdminConfig() ? getSupabaseAdminClient() : getSupabaseServerPublicClient()
          const { data, error } = await client
            .from('org_member_profiles')
            .select('email, display_name')
            .ilike('display_name', username)
            .limit(1)

          if (error && error.code !== '42P01') {
            // If lookup cannot run in this environment, do not block the user with a false "taken" result.
            return Response.json({ available: true, username, reason: 'Availability check is limited in this environment.' })
          }

          let takenInMetadata = false
          const normalized = username.toLowerCase()

          let authIndexUsers = await listAuthIndexedUsers(client)
          if (authIndexUsers.length === 0 && hasSupabaseAdminConfig()) {
            const admin = getSupabaseAdminClient()
            const { data: authUsersPage, error: authUsersError } = await admin.auth.admin.listUsers({
              page: 1,
              perPage: 1000,
            })

            if (!authUsersError) {
              authIndexUsers = (authUsersPage?.users || []).map((row) => ({
                id: row.id,
                email: row.email,
                user_metadata: (row.user_metadata as AuthUserMeta | null | undefined) ?? null,
                created_at: row.created_at,
                updated_at: row.updated_at || row.created_at,
                identities: null,
              }))
            }
          }

          takenInMetadata = authIndexUsers.some((row) => {
            const rowEmail = String(row.email || '').toLowerCase()
            if (currentEmail && rowEmail === currentEmail) return false
            const meta = (row.user_metadata as AuthUserMeta | null | undefined) ?? null
            const candidates = [meta?.username, meta?.preferred_username]
            return candidates.some((candidate) => candidate?.trim().toLowerCase() === normalized)
          })

          const takenInProfiles = (Array.isArray(data) ? data : []).some((row) => {
            const rowEmail = String((row as { email?: string | null }).email || '').toLowerCase()
            if (currentEmail && rowEmail === currentEmail) return false
            return true
          })

          const taken = takenInProfiles || takenInMetadata
          return Response.json({ available: !taken, username })
        } catch {
          return Response.json({ available: true, username, reason: 'Availability check is temporarily unavailable.' })
        }
      },
    },
  },
})
