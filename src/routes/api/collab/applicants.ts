import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requirePermission } from '../../../lib/orgAuth'
import { getSupabaseAdminClient } from '../../../lib/supabaseAdmin'
import { listAuthIndexedUsers } from '../../../lib/authUserIndex'
import { readAvatarFromMetadata, readDisplayNameFromMetadata } from '../../../lib/memberDirectory'

const updateSchema = z.object({
  applicationId: z.string().uuid(),
  status: z.enum(['accepted', 'rejected']),
})

type RawApplicant = {
  id: string
  applicant_email: string
  message: string
  status: string
  applied_at: string
}

type ProfileRow = {
  email: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  skills: string[] | null
}

export const Route = createFileRoute('/api/collab/applicants')({
  server: {
    handlers: {
      /**
       * GET /api/collab/applicants?requestId=<uuid>
       * Returns applicants for the given request (owner/admin only).
       * Each applicant includes their public profile.
       */
      GET: async ({ request }) => {
        try {
          const access = await requirePermission(request, 'view_creator_tools')
          const url = new URL(request.url)
          const requestId = url.searchParams.get('requestId')
          if (!requestId) return Response.json({ error: 'requestId is required' }, { status: 400 })

          const admin = getSupabaseAdminClient()
          const isAdmin = access.role === 'admin' || access.role === 'superadmin'

          if (!isAdmin) {
            const { data: req } = await admin
              .from('org_collab_requests')
              .select('owner_email')
              .eq('id', requestId)
              .maybeSingle()
            const owner = (req as { owner_email: string } | null)?.owner_email
            if (!owner || owner !== access.requester.email) {
              return Response.json({ error: 'Not authorized' }, { status: 403 })
            }
          }

          const { data, error } = await admin
            .from('org_collab_applications')
            .select('id, applicant_email, message, status, applied_at')
            .eq('request_id', requestId)
            .order('applied_at', { ascending: true })

          if (error) return Response.json({ error: error.message }, { status: 500 })

          const applicants: RawApplicant[] = data || []
          const emails = applicants.map((a) => a.applicant_email)
          const requestedEmailSet = new Set(
            emails
              .map((email) => String(email || '').trim().toLowerCase())
              .filter(Boolean),
          )

          let profiles: Record<string, ProfileRow> = {}
          if (emails.length) {
            const { data: profileData } = await admin
              .from('org_member_profiles')
              .select('email, display_name, avatar_url, bio, skills')
              .in('email', emails)
            for (const p of (profileData as ProfileRow[] | null || [])) {
              profiles[String(p.email || '').trim().toLowerCase()] = p
            }
          }

          const authUsers = await listAuthIndexedUsers(admin)
          const authFallback = new Map<string, { display_name: string | null; avatar_url: string | null }>()

          for (const user of authUsers) {
            const email = String(user.email || '').trim().toLowerCase()
            if (!email || !requestedEmailSet.has(email)) continue

            authFallback.set(email, {
              display_name: readDisplayNameFromMetadata((user.user_metadata as any) || null),
              avatar_url: readAvatarFromMetadata((user.user_metadata as any) || null),
            })
          }

          return Response.json({
            applicants: applicants.map((a) => ({
              ...a,
              profile: (() => {
                const email = String(a.applicant_email || '').trim().toLowerCase()
                const profile = profiles[email]
                const fallback = authFallback.get(email)

                if (profile) {
                  return {
                    ...profile,
                    display_name: profile.display_name || fallback?.display_name || null,
                    avatar_url: profile.avatar_url || fallback?.avatar_url || null,
                  }
                }

                if (!fallback) return null

                return {
                  email: a.applicant_email,
                  display_name: fallback.display_name || null,
                  avatar_url: fallback.avatar_url || null,
                  bio: null,
                  skills: null,
                }
              })(),
            })),
          })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },

      /**
       * PUT /api/collab/applicants
       * Body: { applicationId, status: 'accepted' | 'rejected' }
       * Owner accepts/rejects an application.
       */
      PUT: async ({ request }) => {
        try {
          const access = await requirePermission(request, 'view_creator_tools')
          const body = await request.json()
          const parsed = updateSchema.safeParse(body)
          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload' }, { status: 400 })
          }

          const admin = getSupabaseAdminClient()
          const isAdmin = access.role === 'admin' || access.role === 'superadmin'

          // Fetch the application to get request_id for ownership check
          const { data: app } = await admin
            .from('org_collab_applications')
            .select('id, request_id')
            .eq('id', parsed.data.applicationId)
            .maybeSingle()

          if (!app) return Response.json({ error: 'Application not found' }, { status: 404 })

          if (!isAdmin) {
            const { data: req } = await admin
              .from('org_collab_requests')
              .select('owner_email')
              .eq('id', (app as { request_id: string }).request_id)
              .maybeSingle()
            const owner = (req as { owner_email: string } | null)?.owner_email
            if (!owner || owner !== access.requester.email) {
              return Response.json({ error: 'Not authorized' }, { status: 403 })
            }
          }

          const { error } = await admin
            .from('org_collab_applications')
            .update({ status: parsed.data.status })
            .eq('id', parsed.data.applicationId)

          if (error) return Response.json({ error: error.message }, { status: 500 })
          return Response.json({ updated: true })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },
    },
  },
})
