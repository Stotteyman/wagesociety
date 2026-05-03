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
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin'

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/

type AuthUserMeta = {
  username?: string
  full_name?: string
  name?: string
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
          const admin = getSupabaseAdminClient()
          const { data, error } = await admin
            .from('org_member_profiles')
            .select('email, display_name')
            .ilike('display_name', username)
            .limit(1)

          if (error && error.code !== '42P01') {
            // 42P01 = table does not exist yet → no profiles → username is free
            return Response.json({ error: 'Could not check username availability.' }, { status: 500 })
          }

          const { data: authUsersPage, error: authUsersError } = await admin.auth.admin.listUsers({
            page: 1,
            perPage: 1000,
          })

          if (authUsersError) {
            return Response.json({ error: 'Could not check username availability.' }, { status: 500 })
          }

          const normalized = username.toLowerCase()
          const takenInMetadata = (authUsersPage?.users || []).some((row) => {
            const rowEmail = String(row.email || '').toLowerCase()
            if (currentEmail && rowEmail === currentEmail) return false
            const meta = (row.user_metadata as AuthUserMeta | null | undefined) ?? null
            const candidates = [meta?.username, meta?.full_name, meta?.name, meta?.preferred_username]
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
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },
    },
  },
})
