import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { canManageRole, ORG_ROLES, type OrgRole } from '../../../lib/orgAccess'
import { getBanRecord } from '../../../lib/orgAuth'
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../../lib/supabaseAdmin'
import { getRequesterAccess, requirePermission } from '../../../lib/orgAuth'
import { getSupabaseServerPublicClient } from '../../../lib/supabaseServer'

function getAdminOrPublicClient() {
  return hasSupabaseAdminConfig() ? getSupabaseAdminClient() : getSupabaseServerPublicClient()
}

const setRoleSchema = z.object({
  targetEmail: z.string().email(),
  role: z.enum(ORG_ROLES),
  banReason: z.string().trim().max(500).nullable().optional(),
  bannedUntil: z.string().datetime({ offset: true }).nullable().optional(),
})

export const Route = createFileRoute('/api/admin/roles')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { role, permissions } = await getRequesterAccess(request)

          if (role !== 'superadmin' && !permissions.includes('manage_users')) {
            return Response.json({ error: 'Manage users permission required' }, { status: 403 })
          }

          const admin = getAdminOrPublicClient()

          const { data, error } = await admin.rpc('list_org_member_roles')

          if (error) {
            return Response.json({ error: error.message }, { status: 500 })
          }

          return Response.json({
            requester: {
              ...requester,
              role,
              permissions,
            },
            roles: data || [],
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
          const { requester, role } = await requirePermission(request, 'manage_users')
          const admin = getAdminOrPublicClient()
          const body = await request.json()
          const parsed = setRoleSchema.safeParse(body)

          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          const normalizedEmail = parsed.data.targetEmail.toLowerCase()
          const requestedRole = parsed.data.role as OrgRole

          const { data: currentMember, error: currentMemberError } = await admin
            .from('org_user_roles')
            .select('role')
            .eq('email', normalizedEmail)
            .maybeSingle()

          if (currentMemberError) {
            return Response.json({ error: currentMemberError.message }, { status: 500 })
          }

          if (currentMember?.role && !canManageRole(role, currentMember.role as OrgRole)) {
            return Response.json({ error: 'You cannot change a member at your role level or above' }, { status: 403 })
          }

          if (!canManageRole(role, requestedRole)) {
            return Response.json({ error: 'You cannot assign that role' }, { status: 403 })
          }

          if (requestedRole === 'banned' && !parsed.data.banReason?.trim()) {
            return Response.json({ error: 'Ban reason is required when banning a member' }, { status: 400 })
          }

          const { data, error } = await admin.rpc('set_org_member_role', {
            p_target_email: normalizedEmail,
            p_role: requestedRole,
            p_granted_by: requester.email,
            p_banned_by: requestedRole === 'banned' ? requester.email : null,
            p_ban_reason: requestedRole === 'banned' ? parsed.data.banReason?.trim() || null : null,
            p_banned_until: requestedRole === 'banned' ? parsed.data.bannedUntil || null : null,
          })

          if (error) {
            return Response.json({ error: error.message }, { status: 500 })
          }

          const updated = data?.[0] || null
          const ban = updated?.role === 'banned' ? await getBanRecord(normalizedEmail) : null

          return Response.json({
            updated: updated
              ? {
                  ...updated,
                  ban,
                }
              : null,
          })
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
