import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requirePermission } from '../../../../lib/orgAuth'
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../../../lib/supabaseAdmin'
import { getSupabaseServerPublicClient } from '../../../../lib/supabaseServer'

function getAdminOrPublicClient() {
  return hasSupabaseAdminConfig() ? getAdminOrPublicClient() : getSupabaseServerPublicClient()
}

const createMerchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  price: z.string().trim().min(1).max(40),
  description: z.string().trim().min(1).max(600),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})

const updateMerchSchema = createMerchSchema.extend({
  id: z.string().uuid(),
})

const deleteMerchSchema = z.object({
  id: z.string().uuid(),
})

export const Route = createFileRoute('/api/admin/shop/merch')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const access = await requirePermission(request, 'access_admin_dashboard')
          const admin = getAdminOrPublicClient()

          const { data, error } = await admin
            .from('org_shop_merch_items')
            .select('id, name, price, description, sort_order, is_active, created_at, updated_at')
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true })

          if (error) return Response.json({ error: error.message }, { status: 500 })

          return Response.json({
            requester: {
              ...access.requester,
              role: access.role,
            },
            items: data || [],
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
          await requirePermission(request, 'access_admin_dashboard')
          const admin = getAdminOrPublicClient()
          const body = await request.json()
          const parsed = createMerchSchema.safeParse(body)

          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          const { data, error } = await admin
            .from('org_shop_merch_items')
            .insert({
              name: parsed.data.name,
              price: parsed.data.price,
              description: parsed.data.description,
              sort_order: parsed.data.sortOrder,
              is_active: parsed.data.isActive,
            })
            .select('id, name, price, description, sort_order, is_active, created_at, updated_at')
            .single()

          if (error) return Response.json({ error: error.message }, { status: 500 })

          return Response.json({ item: data })
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
          await requirePermission(request, 'access_admin_dashboard')
          const admin = getAdminOrPublicClient()
          const body = await request.json()
          const parsed = updateMerchSchema.safeParse(body)

          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          const { data, error } = await admin
            .from('org_shop_merch_items')
            .update({
              name: parsed.data.name,
              price: parsed.data.price,
              description: parsed.data.description,
              sort_order: parsed.data.sortOrder,
              is_active: parsed.data.isActive,
              updated_at: new Date().toISOString(),
            })
            .eq('id', parsed.data.id)
            .select('id, name, price, description, sort_order, is_active, created_at, updated_at')
            .single()

          if (error) return Response.json({ error: error.message }, { status: 500 })

          return Response.json({ item: data })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json(
            { error: error instanceof Error ? error.message : 'Unexpected server error' },
            { status: 500 },
          )
        }
      },
      DELETE: async ({ request }) => {
        try {
          await requirePermission(request, 'access_admin_dashboard')
          const admin = getAdminOrPublicClient()
          const body = await request.json()
          const parsed = deleteMerchSchema.safeParse(body)

          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          const { error } = await admin
            .from('org_shop_merch_items')
            .delete()
            .eq('id', parsed.data.id)

          if (error) return Response.json({ error: error.message }, { status: 500 })

          return Response.json({ deleted: true })
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
