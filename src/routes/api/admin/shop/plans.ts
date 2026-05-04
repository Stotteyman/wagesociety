import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requirePermission } from '../../../../lib/orgAuth'
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../../../lib/supabaseAdmin'
import { getSupabaseServerPublicClient } from '../../../../lib/supabaseServer'

function getAdminOrPublicClient() {
  return hasSupabaseAdminConfig() ? getSupabaseAdminClient() : getSupabaseServerPublicClient()
}

const planBaseSchema = z.object({
  slug: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  displayPrice: z.string().trim().min(1).max(40),
  priceCents: z.number().int().min(0),
  description: z.string().trim().min(1).max(600),
  features: z.array(z.string().trim().min(1).max(200)).max(20),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})

const createPlanSchema = planBaseSchema
const updatePlanSchema = planBaseSchema.extend({
  id: z.string().uuid(),
})

const deletePlanSchema = z.object({
  id: z.string().uuid(),
})

export const Route = createFileRoute('/api/admin/shop/plans')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const access = await requirePermission(request, 'access_admin_dashboard')
          const admin = getAdminOrPublicClient()

          const { data, error } = await admin
            .from('org_shop_membership_plans')
            .select('id, slug, name, display_price, price_cents, description, features, sort_order, is_active, created_at, updated_at')
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true })

          if (error) return Response.json({ error: error.message }, { status: 500 })

          return Response.json({
            requester: {
              ...access.requester,
              role: access.role,
            },
            plans: data || [],
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
          const parsed = createPlanSchema.safeParse(body)

          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          const { data, error } = await admin
            .from('org_shop_membership_plans')
            .insert({
              slug: parsed.data.slug.toLowerCase(),
              name: parsed.data.name,
              display_price: parsed.data.displayPrice,
              price_cents: parsed.data.priceCents,
              description: parsed.data.description,
              features: parsed.data.features,
              sort_order: parsed.data.sortOrder,
              is_active: parsed.data.isActive,
            })
            .select('id, slug, name, display_price, price_cents, description, features, sort_order, is_active, created_at, updated_at')
            .single()

          if (error) return Response.json({ error: error.message }, { status: 500 })

          return Response.json({ plan: data })
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
          const parsed = updatePlanSchema.safeParse(body)

          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          const { data, error } = await admin
            .from('org_shop_membership_plans')
            .update({
              slug: parsed.data.slug.toLowerCase(),
              name: parsed.data.name,
              display_price: parsed.data.displayPrice,
              price_cents: parsed.data.priceCents,
              description: parsed.data.description,
              features: parsed.data.features,
              sort_order: parsed.data.sortOrder,
              is_active: parsed.data.isActive,
              updated_at: new Date().toISOString(),
            })
            .eq('id', parsed.data.id)
            .select('id, slug, name, display_price, price_cents, description, features, sort_order, is_active, created_at, updated_at')
            .single()

          if (error) return Response.json({ error: error.message }, { status: 500 })

          return Response.json({ plan: data })
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
          const parsed = deletePlanSchema.safeParse(body)

          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          const { error } = await admin
            .from('org_shop_membership_plans')
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
