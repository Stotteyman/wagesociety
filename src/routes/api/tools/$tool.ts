import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requirePermission } from '../../../lib/orgAuth'
import type { OrgPermission } from '../../../lib/orgAccess'
import { getSupabaseAdminClient } from '../../../lib/supabaseAdmin'

const toolSchema = z.enum([
  'bulletin-board',
  'content-calendar',
  'revenue-tracker',
  'creator-task-board',
  'collaboration-hub',
  'knowledge-vault',
])

const statusSchema = z.enum(['idea', 'planned', 'active', 'blocked', 'done'])

const baseEntrySchema = z.object({
  title: z.string().trim().min(1).max(160),
  details: z.string().trim().max(4000).default(''),
  status: statusSchema.default('active'),
  eventDate: z.string().datetime().nullable().optional(),
  amountCents: z.number().int().min(0).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const createEntrySchema = baseEntrySchema
const updateEntrySchema = baseEntrySchema.extend({
  id: z.string().uuid(),
})
const deleteEntrySchema = z.object({
  id: z.string().uuid(),
})

const requiredPermissionByTool: Record<z.infer<typeof toolSchema>, OrgPermission> = {
  'bulletin-board': 'view_creator_tools',
  'content-calendar': 'view_creator_tools',
  'revenue-tracker': 'view_revenue_tracker',
  'creator-task-board': 'view_creator_tools',
  'collaboration-hub': 'view_creator_tools',
  'knowledge-vault': 'view_creator_tools',
}

function resolveToolAndPermission(rawTool: string) {
  const parsed = toolSchema.safeParse(rawTool)

  if (!parsed.success) {
    throw new Response(JSON.stringify({ error: 'Invalid tool key' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const tool = parsed.data
  const permission = requiredPermissionByTool[tool]

  return { tool, permission }
}

async function authorizeForTool(request: Request, rawTool: string) {
  const { tool, permission } = resolveToolAndPermission(rawTool)
  const access = await requirePermission(request, permission)

  return { tool, access }
}

function requesterPayload(access: {
  requester: { email: string; source: string }
  role: string
}) {
  return {
    ...access.requester,
    role: access.role,
  }
}

export const Route = createFileRoute('/api/tools/$tool')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { tool, access } = await authorizeForTool(request, params.tool)
          const admin = getSupabaseAdminClient()

          // Revenue tracker is personalized — each member only sees their own entries
          // Admins/superadmins can view all by passing ?all=1
          const url = new URL(request.url)
          const isAdmin = access.role === 'admin' || access.role === 'superadmin'
          const viewAll = isAdmin && url.searchParams.get('all') === '1'
          const ownerFilter = tool === 'revenue-tracker' && !viewAll
            ? access.requester.email
            : null

          let query = admin
            .from('org_dashboard_tool_entries')
            .select('id, tool_key, title, details, status, event_date, amount_cents, metadata, created_by, updated_by, created_at, updated_at')
            .eq('tool_key', tool)

          if (ownerFilter) {
            query = query.eq('created_by', ownerFilter)
          }

          query = query
            .order('event_date', { ascending: false, nullsFirst: false })
            .order('updated_at', { ascending: false })

          const { data, error } = await query

          if (error) return Response.json({ error: error.message }, { status: 500 })

          return Response.json({
            requester: requesterPayload(access),
            tool,
            entries: data || [],
          })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },
      POST: async ({ request, params }) => {
        try {
          const { tool, access } = await authorizeForTool(request, params.tool)
          const admin = getSupabaseAdminClient()
          const body = await request.json()
          const parsed = createEntrySchema.safeParse(body)

          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          const { data, error } = await admin
            .from('org_dashboard_tool_entries')
            .insert({
              tool_key: tool,
              title: parsed.data.title,
              details: parsed.data.details,
              status: parsed.data.status,
              event_date: parsed.data.eventDate ?? null,
              amount_cents: parsed.data.amountCents ?? null,
              metadata: parsed.data.metadata || {},
              created_by: access.requester.email,
              updated_by: access.requester.email,
            })
            .select('id, tool_key, title, details, status, event_date, amount_cents, metadata, created_by, updated_by, created_at, updated_at')
            .single()

          if (error) return Response.json({ error: error.message }, { status: 500 })

          return Response.json({ entry: data })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },
      PUT: async ({ request, params }) => {
        try {
          const { tool, access } = await authorizeForTool(request, params.tool)
          const admin = getSupabaseAdminClient()
          const body = await request.json()
          const parsed = updateEntrySchema.safeParse(body)

          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          const { data, error } = await admin
            .from('org_dashboard_tool_entries')
            .update({
              title: parsed.data.title,
              details: parsed.data.details,
              status: parsed.data.status,
              event_date: parsed.data.eventDate ?? null,
              amount_cents: parsed.data.amountCents ?? null,
              metadata: parsed.data.metadata || {},
              updated_by: access.requester.email,
              updated_at: new Date().toISOString(),
            })
            .eq('id', parsed.data.id)
            .eq('tool_key', tool)
            .select('id, tool_key, title, details, status, event_date, amount_cents, metadata, created_by, updated_by, created_at, updated_at')
            .single()

          if (error) return Response.json({ error: error.message }, { status: 500 })

          return Response.json({ entry: data })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const { tool } = await authorizeForTool(request, params.tool)
          const admin = getSupabaseAdminClient()
          const body = await request.json()
          const parsed = deleteEntrySchema.safeParse(body)

          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          const { error } = await admin
            .from('org_dashboard_tool_entries')
            .delete()
            .eq('id', parsed.data.id)
            .eq('tool_key', tool)

          if (error) return Response.json({ error: error.message }, { status: 500 })

          return Response.json({ deleted: true })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },
    },
  },
})
