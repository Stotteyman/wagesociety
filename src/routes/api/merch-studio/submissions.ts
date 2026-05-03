import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { getRequesterAccess, isLocalRequest, requirePermission } from '../../../lib/orgAuth'
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../../lib/supabaseAdmin'
import { getSupabaseServerPublicClient } from '../../../lib/supabaseServer'

const createSubmissionSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(10).max(5000),
  submissionTarget: z.enum(['personal_store', 'wage_shop']),
  mediaUrls: z.array(z.string().url()).max(30).default([]),
  embedLinks: z.array(z.string().url()).max(30).default([]),
  externalStoreUrl: z.string().url().optional().or(z.literal('')),
})

const adminReviewSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['under_review', 'accepted', 'denied']),
  adminNotes: z.string().max(5000).optional(),
  creatorSplitPercent: z.number().min(0).max(100),
  wageSplitPercent: z.number().min(0).max(100),
})

type SubmissionRow = {
  id: string
  creator_email: string
  title: string
  description: string
  submission_target: 'personal_store' | 'wage_shop'
  media_urls: string[] | null
  embed_links: string[] | null
  external_store_url: string | null
  status: 'submitted' | 'under_review' | 'accepted' | 'denied'
  admin_notes: string | null
  creator_split_percent: number
  wage_split_percent: number
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

function mapSubmission(row: SubmissionRow) {
  return {
    id: row.id,
    creatorEmail: row.creator_email,
    title: row.title,
    description: row.description,
    submissionTarget: row.submission_target,
    mediaUrls: row.media_urls || [],
    embedLinks: row.embed_links || [],
    externalStoreUrl: row.external_store_url,
    status: row.status,
    adminNotes: row.admin_notes,
    creatorSplitPercent: Number(row.creator_split_percent),
    wageSplitPercent: Number(row.wage_split_percent),
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const Route = createFileRoute('/api/merch-studio/submissions')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          if (hasSupabaseAdminConfig()) {
            const access = await getRequesterAccess(request)
            if (access.role === 'banned') {
              return Response.json({ error: 'Banned users cannot use Merch Studio.' }, { status: 403 })
            }

            const canReview = access.isSuperadmin || access.permissions.includes('access_admin_dashboard')
            const admin = getSupabaseAdminClient() as any

            let query = admin
              .from('org_merch_studio_submissions')
              .select('*')
              .order('created_at', { ascending: false })

            if (!canReview) {
              query = query.eq('creator_email', access.requester.email)
            }

            const { data, error } = await query
            if (error) return Response.json({ error: error.message }, { status: 500 })

            return Response.json({
              canReview,
              submissions: (data || []).map((row) => mapSubmission(row as SubmissionRow)),
            })
          }

          const useLocalRoot = request.headers.get('x-local-root-session') === 'true' && isLocalRequest(request)
          if (!useLocalRoot) {
            return Response.json(
              { error: 'Merch Studio currently requires SUPABASE_SERVICE_ROLE_KEY in this environment.' },
              { status: 503 },
            )
          }

          const client = getSupabaseServerPublicClient() as any
          const { data, error } = await client
            .from('org_merch_studio_submissions')
            .select('*')
            .order('created_at', { ascending: false })

          if (error) return Response.json({ error: error.message }, { status: 500 })

          return Response.json({
            canReview: true,
            submissions: (data || []).map((row) => mapSubmission(row as SubmissionRow)),
          })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json(
            { error: error instanceof Error ? error.message : 'Unexpected server error' },
            { status: 500 },
          )
        }
      },

      POST: async ({ request }) => {
        try {
          if (!hasSupabaseAdminConfig()) {
            const useLocalRoot = request.headers.get('x-local-root-session') === 'true' && isLocalRequest(request)
            if (!useLocalRoot) {
              return Response.json(
                { error: 'Merch Studio submissions require SUPABASE_SERVICE_ROLE_KEY in this environment.' },
                { status: 503 },
              )
            }

            const payload = createSubmissionSchema.safeParse(await request.json())
            if (!payload.success) {
              return Response.json({ error: payload.error.flatten() }, { status: 400 })
            }

            const client = getSupabaseServerPublicClient() as any
            const { data, error } = await client
              .from('org_merch_studio_submissions')
              .insert([
                {
                  creator_email: 'root-superadmin@localhost',
                  title: payload.data.title,
                  description: payload.data.description,
                  submission_target: payload.data.submissionTarget,
                  media_urls: payload.data.mediaUrls,
                  embed_links: payload.data.embedLinks,
                  external_store_url: payload.data.externalStoreUrl || null,
                  status: 'submitted',
                },
              ])
              .select('*')
              .single()

            if (error) return Response.json({ error: error.message }, { status: 500 })
            return Response.json({ submission: mapSubmission(data as SubmissionRow) }, { status: 201 })
          }

          const access = await requirePermission(request, 'view_merch')
          if (access.role === 'banned') {
            return Response.json({ error: 'Banned users cannot use Merch Studio.' }, { status: 403 })
          }

          const payload = createSubmissionSchema.safeParse(await request.json())
          if (!payload.success) {
            return Response.json({ error: payload.error.flatten() }, { status: 400 })
          }

          const admin = getSupabaseAdminClient() as any
          const { data, error } = await admin
            .from('org_merch_studio_submissions')
            .insert([
              {
                creator_email: access.requester.email,
                title: payload.data.title,
                description: payload.data.description,
                submission_target: payload.data.submissionTarget,
                media_urls: payload.data.mediaUrls,
                embed_links: payload.data.embedLinks,
                external_store_url: payload.data.externalStoreUrl || null,
                status: 'submitted',
              },
            ])
            .select('*')
            .single()

          if (error) return Response.json({ error: error.message }, { status: 500 })
          return Response.json({ submission: mapSubmission(data as SubmissionRow) }, { status: 201 })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json(
            { error: error instanceof Error ? error.message : 'Unexpected server error' },
            { status: 500 },
          )
        }
      },

      PUT: async ({ request }) => {
        try {
          const payload = adminReviewSchema.safeParse(await request.json())
          if (!payload.success) {
            return Response.json({ error: payload.error.flatten() }, { status: 400 })
          }

          if (Math.round((payload.data.creatorSplitPercent + payload.data.wageSplitPercent) * 100) !== 10000) {
            return Response.json({ error: 'Creator and WAGE split must add up to 100%.' }, { status: 400 })
          }

          if (!hasSupabaseAdminConfig()) {
            const useLocalRoot = request.headers.get('x-local-root-session') === 'true' && isLocalRequest(request)
            if (!useLocalRoot) {
              return Response.json(
                { error: 'Merch Studio reviews require SUPABASE_SERVICE_ROLE_KEY in this environment.' },
                { status: 503 },
              )
            }

            const client = getSupabaseServerPublicClient() as any
            const updatePayload: Record<string, unknown> = {
              status: payload.data.status,
              admin_notes: payload.data.adminNotes || null,
              creator_split_percent: payload.data.creatorSplitPercent,
              wage_split_percent: payload.data.wageSplitPercent,
              approved_by: 'root-superadmin@localhost',
              approved_at: payload.data.status === 'accepted' ? new Date().toISOString() : null,
              updated_at: new Date().toISOString(),
            }

            const { data, error } = await client
              .from('org_merch_studio_submissions')
              .update(updatePayload)
              .eq('id', payload.data.id)
              .select('*')
              .single()

            if (error) return Response.json({ error: error.message }, { status: 500 })
            return Response.json({ submission: mapSubmission(data as SubmissionRow) })
          }

          const access = await requirePermission(request, 'access_admin_dashboard')
          const admin = getSupabaseAdminClient() as any

          const updatePayload: Record<string, unknown> = {
            status: payload.data.status,
            admin_notes: payload.data.adminNotes || null,
            creator_split_percent: payload.data.creatorSplitPercent,
            wage_split_percent: payload.data.wageSplitPercent,
            approved_by: access.requester.email,
            approved_at: payload.data.status === 'accepted' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          }

          const { data, error } = await admin
            .from('org_merch_studio_submissions')
            .update(updatePayload)
            .eq('id', payload.data.id)
            .select('*')
            .single()

          if (error) return Response.json({ error: error.message }, { status: 500 })
          return Response.json({ submission: mapSubmission(data as SubmissionRow) })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json(
            { error: error instanceof Error ? error.message : 'Unexpected server error' },
            { status: 500 },
          )
        }
      },
    },
  },
})
