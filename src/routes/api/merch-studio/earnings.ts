import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { getRequesterAccess, isLocalRequest, requirePermission } from '../../../lib/orgAuth'
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../../lib/supabaseAdmin'
import { getSupabaseServerPublicClient } from '../../../lib/supabaseServer'

const createEarningSchema = z.object({
  submissionId: z.string().uuid(),
  grossCents: z.number().int().min(0),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  notes: z.string().max(5000).optional(),
})

const updatePaidSchema = z.object({
  id: z.string().uuid(),
  paidToMemberCents: z.number().int().min(0),
  paidToWageCents: z.number().int().min(0),
})

type SubmissionRow = {
  id: string
  creator_email: string
  title: string
  creator_split_percent: number
  wage_split_percent: number
}

type EarningRow = {
  id: string
  submission_id: string
  recorded_by: string
  period_start: string | null
  period_end: string | null
  gross_cents: number
  member_due_cents: number
  wage_due_cents: number
  paid_to_member_cents: number
  paid_to_wage_cents: number
  notes: string | null
  created_at: string
  updated_at: string
}

function mapEarning(row: EarningRow) {
  return {
    id: row.id,
    submissionId: row.submission_id,
    recordedBy: row.recorded_by,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    grossCents: row.gross_cents,
    memberDueCents: row.member_due_cents,
    wageDueCents: row.wage_due_cents,
    paidToMemberCents: row.paid_to_member_cents,
    paidToWageCents: row.paid_to_wage_cents,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const Route = createFileRoute('/api/merch-studio/earnings')({
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
              .from('org_merch_studio_earnings')
              .select('id, submission_id, recorded_by, period_start, period_end, gross_cents, member_due_cents, wage_due_cents, paid_to_member_cents, paid_to_wage_cents, notes, created_at, updated_at')
              .order('created_at', { ascending: false })

            if (!canReview) {
              const { data: ownSubmissions, error: ownError } = await admin
                .from('org_merch_studio_submissions')
                .select('id')
                .eq('creator_email', access.requester.email)

              if (ownError) {
                return Response.json({ error: ownError.message }, { status: 500 })
              }

              const ids = (ownSubmissions || []).map((row: { id: string }) => row.id)
              if (ids.length === 0) {
                return Response.json({ canReview, earnings: [], summary: { memberDueCents: 0, memberPaidCents: 0, memberPendingCents: 0 } })
              }

              query = query.in('submission_id', ids)
            }

            const { data, error } = await query
            if (error) return Response.json({ error: error.message }, { status: 500 })

            const rawRows = (data || []) as EarningRow[]
            const mapped = rawRows.map(mapEarning)
            const summary = { memberDueCents: 0, memberPaidCents: 0, memberPendingCents: 0 }
            for (const entry of mapped) {
              summary.memberDueCents += entry.memberDueCents
              summary.memberPaidCents += entry.paidToMemberCents
              summary.memberPendingCents += Math.max(0, entry.memberDueCents - entry.paidToMemberCents)
            }

            return Response.json({ canReview, earnings: mapped, summary })
          }

          const useLocalRoot = request.headers.get('x-local-root-session') === 'true' && isLocalRequest(request)
          if (!useLocalRoot) {
            return Response.json(
              { error: 'Merch Studio earnings require SUPABASE_SERVICE_ROLE_KEY in this environment.' },
              { status: 503 },
            )
          }

          const client = getSupabaseServerPublicClient() as any
          const { data, error } = await client
            .from('org_merch_studio_earnings')
            .select('id, submission_id, recorded_by, period_start, period_end, gross_cents, member_due_cents, wage_due_cents, paid_to_member_cents, paid_to_wage_cents, notes, created_at, updated_at')
            .order('created_at', { ascending: false })

          if (error) return Response.json({ error: error.message }, { status: 500 })

          const rawRows = (data || []) as EarningRow[]
          const mapped = rawRows.map(mapEarning)
          const summary = { memberDueCents: 0, memberPaidCents: 0, memberPendingCents: 0 }
          for (const entry of mapped) {
            summary.memberDueCents += entry.memberDueCents
            summary.memberPaidCents += entry.paidToMemberCents
            summary.memberPendingCents += Math.max(0, entry.memberDueCents - entry.paidToMemberCents)
          }

          return Response.json({ canReview: true, earnings: mapped, summary })
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
          const payload = createEarningSchema.safeParse(await request.json())
          if (!payload.success) {
            return Response.json({ error: payload.error.flatten() }, { status: 400 })
          }

          if (!hasSupabaseAdminConfig()) {
            const useLocalRoot = request.headers.get('x-local-root-session') === 'true' && isLocalRequest(request)
            if (!useLocalRoot) {
              return Response.json(
                { error: 'Recording earnings requires SUPABASE_SERVICE_ROLE_KEY in this environment.' },
                { status: 503 },
              )
            }

            const client = getSupabaseServerPublicClient() as any
            const { data: submission, error: submissionError } = await client
              .from('org_merch_studio_submissions')
              .select('id, creator_email, title, creator_split_percent, wage_split_percent')
              .eq('id', payload.data.submissionId)
              .single()

            if (submissionError) return Response.json({ error: submissionError.message }, { status: 500 })

            const submissionRow = submission as SubmissionRow
            const memberDueCents = Math.round(payload.data.grossCents * (Number(submissionRow.creator_split_percent) / 100))
            const wageDueCents = payload.data.grossCents - memberDueCents

            const { data, error } = await client
              .from('org_merch_studio_earnings')
              .insert([
                {
                  submission_id: payload.data.submissionId,
                  recorded_by: 'root-superadmin@localhost',
                  period_start: payload.data.periodStart || null,
                  period_end: payload.data.periodEnd || null,
                  gross_cents: payload.data.grossCents,
                  member_due_cents: memberDueCents,
                  wage_due_cents: wageDueCents,
                  notes: payload.data.notes || null,
                },
              ])
              .select('*')
              .single()

            if (error) return Response.json({ error: error.message }, { status: 500 })
            return Response.json({ earning: mapEarning(data as EarningRow) }, { status: 201 })
          }

          const access = await requirePermission(request, 'access_admin_dashboard')
          const admin = getSupabaseAdminClient() as any

          const { data: submission, error: submissionError } = await admin
            .from('org_merch_studio_submissions')
            .select('id, creator_email, title, creator_split_percent, wage_split_percent')
            .eq('id', payload.data.submissionId)
            .single()

          if (submissionError) return Response.json({ error: submissionError.message }, { status: 500 })

          const submissionRow = submission as SubmissionRow
          const memberDueCents = Math.round(payload.data.grossCents * (Number(submissionRow.creator_split_percent) / 100))
          const wageDueCents = payload.data.grossCents - memberDueCents

          const { data, error } = await admin
            .from('org_merch_studio_earnings')
            .insert([
              {
                submission_id: payload.data.submissionId,
                recorded_by: access.requester.email,
                period_start: payload.data.periodStart || null,
                period_end: payload.data.periodEnd || null,
                gross_cents: payload.data.grossCents,
                member_due_cents: memberDueCents,
                wage_due_cents: wageDueCents,
                notes: payload.data.notes || null,
              },
            ])
            .select('*')
            .single()

          if (error) return Response.json({ error: error.message }, { status: 500 })
          return Response.json({ earning: mapEarning(data as EarningRow) }, { status: 201 })
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
          const payload = updatePaidSchema.safeParse(await request.json())
          if (!payload.success) {
            return Response.json({ error: payload.error.flatten() }, { status: 400 })
          }

          if (!hasSupabaseAdminConfig()) {
            const useLocalRoot = request.headers.get('x-local-root-session') === 'true' && isLocalRequest(request)
            if (!useLocalRoot) {
              return Response.json(
                { error: 'Updating payout tracking requires SUPABASE_SERVICE_ROLE_KEY in this environment.' },
                { status: 503 },
              )
            }

            const client = getSupabaseServerPublicClient() as any
            const { data, error } = await client
              .from('org_merch_studio_earnings')
              .update({
                paid_to_member_cents: payload.data.paidToMemberCents,
                paid_to_wage_cents: payload.data.paidToWageCents,
                updated_at: new Date().toISOString(),
              })
              .eq('id', payload.data.id)
              .select('*')
              .single()

            if (error) return Response.json({ error: error.message }, { status: 500 })
            return Response.json({ earning: mapEarning(data as EarningRow) })
          }

          await requirePermission(request, 'access_admin_dashboard')
          const admin = getSupabaseAdminClient() as any

          const { data, error } = await admin
            .from('org_merch_studio_earnings')
            .update({
              paid_to_member_cents: payload.data.paidToMemberCents,
              paid_to_wage_cents: payload.data.paidToWageCents,
              updated_at: new Date().toISOString(),
            })
            .eq('id', payload.data.id)
            .select('*')
            .single()

          if (error) return Response.json({ error: error.message }, { status: 500 })
          return Response.json({ earning: mapEarning(data as EarningRow) })
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
