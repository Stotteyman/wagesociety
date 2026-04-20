import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requirePermission } from '../../../lib/orgAuth'
import { getSupabaseAdminClient } from '../../../lib/supabaseAdmin'

const applySchema = z.object({
  requestId: z.string().uuid(),
  message: z.string().trim().max(500).default(''),
})

type RawApplication = {
  id: string
  request_id: string
  message: string
  status: string
  applied_at: string
}

export const Route = createFileRoute('/api/collab/apply')({
  server: {
    handlers: {
      /**
       * POST /api/collab/apply
       * Body: { requestId, message? }
       * Creates or refreshes an application.
       */
      POST: async ({ request }) => {
        try {
          const access = await requirePermission(request, 'view_creator_tools')
          const body = await request.json()
          const parsed = applySchema.safeParse(body)
          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload' }, { status: 400 })
          }

          const admin = getSupabaseAdminClient()

          // Verify request exists and is open
          const { data: req, error: reqError } = await admin
            .from('org_collab_requests')
            .select('id, owner_email, status')
            .eq('id', parsed.data.requestId)
            .eq('status', 'open')
            .maybeSingle()

          if (reqError) return Response.json({ error: reqError.message }, { status: 500 })
          if (!req) return Response.json({ error: 'Collab request not found or closed.' }, { status: 404 })
          if ((req as { owner_email: string }).owner_email === access.requester.email) {
            return Response.json({ error: 'You cannot apply to your own request.' }, { status: 400 })
          }

          const { data, error } = await admin
            .from('org_collab_applications')
            .upsert(
              {
                request_id: parsed.data.requestId,
                applicant_email: access.requester.email,
                message: parsed.data.message,
                status: 'pending',
              },
              { onConflict: 'request_id,applicant_email' }
            )
            .select('id, status')
            .single()

          if (error) return Response.json({ error: error.message }, { status: 500 })
          return Response.json({ application: data })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },

      /**
       * GET /api/collab/apply
       * Returns all applications the current user has submitted.
       */
      GET: async ({ request }) => {
        try {
          const access = await requirePermission(request, 'view_creator_tools')
          const admin = getSupabaseAdminClient()

          const { data, error } = await admin
            .from('org_collab_applications')
            .select('id, request_id, message, status, applied_at')
            .eq('applicant_email', access.requester.email)
            .order('applied_at', { ascending: false })

          if (error && error.code !== '42P01') {
            return Response.json({ error: error.message }, { status: 500 })
          }

          const apps: RawApplication[] = data || []

          // Enrich with request info
          const requestIds = apps.map((a) => a.request_id)
          let requestMap: Record<string, { title: string; owner_email: string }> = {}
          if (requestIds.length) {
            const { data: reqs } = await admin
              .from('org_collab_requests')
              .select('id, title, owner_email')
              .in('id', requestIds)
            for (const r of (reqs as Array<{ id: string; title: string; owner_email: string }> | null || [])) {
              requestMap[r.id] = { title: r.title, owner_email: r.owner_email }
            }
          }

          return Response.json({
            applications: apps.map((a) => ({
              ...a,
              requestTitle: requestMap[a.request_id]?.title || null,
              requestOwner: requestMap[a.request_id]?.owner_email || null,
            })),
          })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },
    },
  },
})
