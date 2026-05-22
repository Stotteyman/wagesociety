/**
 * Public profile lookup — returns limited public info for a given member email.
 * Requires the viewer to be authenticated.
 */
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '../../lib/orgAuth'
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin'
import { listAuthIndexedUsers } from '../../lib/authUserIndex'
import { readAvatarFromMetadata, readDisplayNameFromMetadata } from '../../lib/memberDirectory'

export const Route = createFileRoute('/api/profile')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requirePermission(request, 'view_creator_tools')
          const url = new URL(request.url)
          const email = url.searchParams.get('email')
          if (!email) return Response.json({ error: 'email is required' }, { status: 400 })

          const admin = getSupabaseAdminClient()
          const normalizedEmail = email.trim().toLowerCase()
          const { data, error } = await admin
            .from('org_member_profiles')
            .select('email, display_name, avatar_url, bio, skills')
            .eq('email', normalizedEmail)
            .maybeSingle()

          if (error && error.code !== '42P01') {
            return Response.json({ error: error.message }, { status: 500 })
          }

          const dbProfile = data || null

          const authUsers = await listAuthIndexedUsers(admin)
          const authUser = authUsers.find(
            (user) => String(user.email || '').trim().toLowerCase() === normalizedEmail,
          )
          const meta = ((authUser?.user_metadata as any) || null)
          const metaDisplayName = readDisplayNameFromMetadata(meta)
          const metaAvatarUrl = readAvatarFromMetadata(meta)

          if (!dbProfile && !authUser) {
            return Response.json({ profile: null })
          }

          return Response.json({
            profile: {
              email: dbProfile?.email || email,
              display_name: dbProfile?.display_name || metaDisplayName || null,
              avatar_url: dbProfile?.avatar_url || metaAvatarUrl || null,
              bio: dbProfile?.bio || null,
              skills: dbProfile?.skills || null,
            },
          })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },
    },
  },
})
