import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { canManageRole, ORG_ROLES, type OrgRole } from '../../../lib/orgAccess'
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../../lib/supabaseAdmin'
import { getRequesterAccess, requirePermission } from '../../../lib/orgAuth'
import { getSupabaseServerPublicClient } from '../../../lib/supabaseServer'

function getAdminOrPublicClient() {
  return hasSupabaseAdminConfig() ? getSupabaseAdminClient() : getSupabaseServerPublicClient()
}

const updatePermissionSchema = z.object({
  role: z.enum(ORG_ROLES),
  permissionKey: z.string().min(1),
  enabled: z.boolean(),
})

export const Route = createFileRoute('/api/admin/permissions')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const access = await getRequesterAccess(request)

          if (!access.isSuperadmin && !access.permissions.includes('manage_permissions')) {
            return Response.json({ error: 'Manage permissions permission required' }, { status: 403 })
          }

          const admin = getAdminOrPublicClient()
          const { data, error } = await admin.rpc('list_org_permission_matrix')

          if (error) {
            return Response.json({ error: error.message }, { status: 500 })
          }

          return Response.json({
            requester: {
              ...access.requester,
              role: access.role,
              permissions: access.permissions,
            },
            matrix: data || [],
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
          const access = await requirePermission(request, 'manage_permissions')
          const admin = getAdminOrPublicClient()
          const body = await request.json()
          const parsed = updatePermissionSchema.safeParse(body)

          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          const targetRole = parsed.data.role as OrgRole

          if (!access.isSuperadmin && !canManageRole(access.role, targetRole)) {
            return Response.json({ error: 'You cannot edit permissions for that role' }, { status: 403 })
          }

          const { data, error } = await admin.rpc('set_org_role_permission', {
            p_role: targetRole,
            p_permission_key: parsed.data.permissionKey,
            p_enabled: parsed.data.enabled,
            p_granted_by: access.requester.email,
          })

          if (error) {
            return Response.json({ error: error.message }, { status: 500 })
          }

          return Response.json({ updated: data?.[0] || null })
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
