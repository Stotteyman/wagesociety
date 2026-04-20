/**
 * Knowledge Vault view tracking API
 *
 * Required Supabase table (run once in SQL editor):
 *
 * create table if not exists org_knowledge_vault_views (
 *   id uuid primary key default gen_random_uuid(),
 *   document_id uuid not null,
 *   viewer_email text not null,
 *   viewer_role text,
 *   viewed_at timestamptz not null default now()
 * );
 * create index on org_knowledge_vault_views (document_id);
 * create index on org_knowledge_vault_views (viewer_email);
 * create index on org_knowledge_vault_views (viewed_at desc);
 */

import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requirePermission } from '../../lib/orgAuth'
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin'

const trackViewSchema = z.object({
  documentId: z.string().uuid(),
})

const adminViewsQuerySchema = z.object({
  documentId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

export const Route = createFileRoute('/api/knowledge-vault')({
  server: {
    handlers: {
      /**
       * POST /api/knowledge-vault
       * Body: { documentId: string }
       * Records that the authenticated user viewed a document.
       */
      POST: async ({ request }) => {
        try {
          const access = await requirePermission(request, 'view_creator_tools')
          const body = await request.json()
          const parsed = trackViewSchema.safeParse(body)

          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          const admin = getSupabaseAdminClient()

          const { error } = await admin.from('org_knowledge_vault_views').insert({
            document_id: parsed.data.documentId,
            viewer_email: access.requester.email,
            viewer_role: access.role,
          })

          // Gracefully handle missing table — view tracking is non-critical
          if (error && error.code !== '42P01') {
            return Response.json({ error: error.message }, { status: 500 })
          }

          return Response.json({ tracked: true })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },

      /**
       * GET /api/knowledge-vault?documentId=<id>&limit=<n>
       * Admin-only: returns view history for a document or all documents.
       */
      GET: async ({ request }) => {
        try {
          const access = await requirePermission(request, 'access_admin_dashboard')
          const url = new URL(request.url)
          const parsed = adminViewsQuerySchema.safeParse({
            documentId: url.searchParams.get('documentId') ?? undefined,
            limit: url.searchParams.get('limit') ?? 100,
          })

          if (!parsed.success) {
            return Response.json({ error: 'Invalid query' }, { status: 400 })
          }

          const admin = getSupabaseAdminClient()
          let query = admin
            .from('org_knowledge_vault_views')
            .select('id, document_id, viewer_email, viewer_role, viewed_at')
            .order('viewed_at', { ascending: false })
            .limit(parsed.data.limit)

          if (parsed.data.documentId) {
            query = query.eq('document_id', parsed.data.documentId)
          }

          const { data, error } = await query

          if (error && error.code === '42P01') {
            return Response.json({ views: [], note: 'Views table not yet created.' })
          }

          if (error) return Response.json({ error: error.message }, { status: 500 })

          return Response.json({
            requester: { email: access.requester.email, role: access.role },
            views: data || [],
          })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },
    },
  },
})
