/**
 * Public profile lookup — returns limited public info for a given member email.
 * Requires the viewer to be authenticated.
 */
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '../../lib/orgAuth'
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin'

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
          const { data, error } = await admin
            .from('org_member_profiles')
            .select('email, display_name, avatar_url, bio, skills, website, social_links')
            .eq('email', email)
            .maybeSingle()

          if (error && error.code !== '42P01') {
            return Response.json({ error: error.message }, { status: 500 })
          }

          return Response.json({ profile: data || null })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },
    },
  },
})
