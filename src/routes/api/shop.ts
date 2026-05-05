import { createFileRoute } from '@tanstack/react-router'
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../lib/supabaseAdmin'
import { getSupabaseServerPublicClient } from '../../lib/supabaseServer'

export const Route = createFileRoute('/api/shop')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const db = hasSupabaseAdminConfig() ? getSupabaseAdminClient() : getSupabaseServerPublicClient()

          const [{ data: merchData, error: merchError }, { data: plansData, error: plansError }] = await Promise.all([
            db
              .from('org_shop_merch_items')
              .select('id, name, price, description, sort_order, is_active, created_at, updated_at')
              .eq('is_active', true)
              .order('sort_order', { ascending: true })
              .order('created_at', { ascending: true }),
            db
              .from('org_shop_membership_plans')
              .select('id, slug, name, display_price, price_cents, description, features, sort_order, is_active, created_at, updated_at')
              .eq('is_active', true)
              .order('sort_order', { ascending: true })
              .order('created_at', { ascending: true }),
          ])

          if (merchError) return Response.json({ error: merchError.message }, { status: 500 })
          if (plansError) return Response.json({ error: plansError.message }, { status: 500 })

          return Response.json({
            merchItems: merchData || [],
            membershipPlans: plansData || [],
          })
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Unexpected server error' },
            { status: 500 },
          )
        }
      },
    },
  },
})
