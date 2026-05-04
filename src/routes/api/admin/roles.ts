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

type RoleListRow = {
  email: string
  role: OrgRole
  granted_by: string | null
  banned_by: string | null
  ban_reason: string | null
  banned_until: string | null
  updated_at: string
  created_at: string
}

type ProfileEmailRow = {
  email: string
  created_at: string | null
  updated_at: string | null
}

type AuthUserListRow = {
  email: string | null
  created_at: string
  updated_at?: string
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
          const access = await getRequesterAccess(request)

          if (!access.isSuperadmin && !access.permissions.includes('manage_users')) {
            return Response.json({ error: 'Manage users permission required' }, { status: 403 })
          }

          const admin = getAdminOrPublicClient()

          const { data, error } = await admin.rpc('list_org_member_roles')

          if (error) {
            return Response.json({ error: error.message }, { status: 500 })
          }

          const roleRows = Array.isArray(data) ? ((data as RoleListRow[]) || []) : []
          const existingEmails = new Set(roleRows.map((row) => String(row.email || '').trim().toLowerCase()).filter(Boolean))

          let mergedRoles = [...roleRows]

          const inferredRows: RoleListRow[] = []

          if (hasSupabaseAdminConfig()) {
            const adminClient = getSupabaseAdminClient()
            let page = 1
            const perPage = 1000

            while (page <= 10) {
              const { data: usersData, error: usersError } = await adminClient.auth.admin.listUsers({ page, perPage })
              if (usersError) break

              const users = (usersData?.users || []) as AuthUserListRow[]
              if (!users.length) break

              for (const user of users) {
                const email = String(user.email || '').trim().toLowerCase()
                if (!email || existingEmails.has(email)) continue
                existingEmails.add(email)

                const createdAt = user.created_at || user.updated_at || new Date().toISOString()
                const updatedAt = user.updated_at || user.created_at || createdAt

                inferredRows.push({
                  email,
                  role: 'user',
                  granted_by: null,
                  banned_by: null,
                  ban_reason: null,
                  banned_until: null,
                  created_at: createdAt,
                  updated_at: updatedAt,
                })
              }

              if (users.length < perPage) break
              page += 1
            }
          }

          // Best-effort: include signed-up members who have not received explicit role rows yet.
          const { data: profileRows, error: profileError } = await admin
            .from('org_member_profiles')
            .select('email, created_at, updated_at')
            .limit(10000)

          if (!profileError && Array.isArray(profileRows)) {
            const profileInferredRows = (profileRows as ProfileEmailRow[])
              .map((profile) => {
                const email = String(profile.email || '').trim().toLowerCase()
                if (!email || existingEmails.has(email)) return null
                existingEmails.add(email)

                const createdAt = profile.created_at || profile.updated_at || new Date().toISOString()
                const updatedAt = profile.updated_at || profile.created_at || createdAt

                return {
                  email,
                  role: 'user' as OrgRole,
                  granted_by: null,
                  banned_by: null,
                  ban_reason: null,
                  banned_until: null,
                  created_at: createdAt,
                  updated_at: updatedAt,
                }
              })
              .filter((row): row is RoleListRow => Boolean(row))

            inferredRows.push(...profileInferredRows)
          }

          if (hasSupabaseAdminConfig() && inferredRows.length > 0) {
            const adminClient = getSupabaseAdminClient()
            // Ensure default role rows exist for all signed-up members discovered from auth/profiles.
            // ignoreDuplicates prevents overwriting existing roles during races.
            await adminClient
              .from('org_user_roles')
              .upsert(
                inferredRows.map((row) => ({
                  email: row.email,
                  role: 'user' as OrgRole,
                  granted_by: row.granted_by,
                })),
                { onConflict: 'email', ignoreDuplicates: true },
              )
          }

          mergedRoles = [...roleRows, ...inferredRows].sort((a, b) => a.email.localeCompare(b.email))

          return Response.json({
            requester: {
              ...access.requester,
              role: access.role,
              permissions: access.permissions,
            },
            roles: mergedRoles,
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
