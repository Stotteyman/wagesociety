import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { canManageRole, ORG_ROLES, type OrgRole } from '../../../lib/orgAccess'
import { listAuthIndexedUsers } from '../../../lib/authUserIndex'
import { getBanRecord } from '../../../lib/orgAuth'
import { getSupabaseAdminClient, getSupabaseAdminConfigIssues, hasSupabaseAdminConfig } from '../../../lib/supabaseAdmin'
import { getRequesterAccess, requirePermission } from '../../../lib/orgAuth'
import { getSupabaseServerClientForToken, getSupabaseServerPublicClient } from '../../../lib/supabaseServer'

function getBearerToken(request: Request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) return undefined
  const token = authHeader.slice(7).trim()
  return token || undefined
}

function getAdminOrRequestClient(request: Request) {
  if (hasSupabaseAdminConfig()) {
    return getSupabaseAdminClient()
  }

  const token = getBearerToken(request)
  if (token) {
    return getSupabaseServerClientForToken(token)
  }

  return getSupabaseServerPublicClient()
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
  user_id?: string | null
  display_name?: string | null
  membership_plan?: string | null
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  effective_permissions?: string[]
}

type AuthUserListRow = {
  id?: string
  email: string | null
  created_at: string
  updated_at?: string
  user_metadata?: Record<string, unknown> | null
}

type AuthUserLite = {
  id: string
  email: string
  created_at: string
  updated_at: string
  user_metadata: Record<string, unknown> | null
}

function toStringOrNull(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function getDisplayName(userMetadata: Record<string, unknown> | null) {
  return (
    toStringOrNull(userMetadata?.full_name) ||
    toStringOrNull(userMetadata?.name) ||
    toStringOrNull(userMetadata?.username) ||
    toStringOrNull(userMetadata?.preferred_username)
  )
}

const setRoleSchema = z.object({
  targetEmail: z.string().email(),
  role: z.enum(ORG_ROLES),
  banReason: z.string().trim().max(500).nullable().optional(),
  bannedUntil: z.string().datetime({ offset: true }).nullable().optional(),
})

const setSubscriptionSchema = z.object({
  targetEmail: z.string().email(),
  membershipPlan: z.string().trim().min(1).max(80),
})

async function findAuthUserByEmail(email: string) {
  if (!hasSupabaseAdminConfig()) return null

  const admin = getSupabaseAdminClient()
  let page = 1
  const perPage = 1000

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(error.message)

    const users = (data?.users || []) as AuthUserListRow[]
    if (!users.length) break

    const match = users.find((user) => String(user.email || '').trim().toLowerCase() === email)
    if (match?.id) return match

    if (users.length < perPage) break
    page += 1
  }

  return null
}

export const Route = createFileRoute('/api/admin/roles')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const access = await getRequesterAccess(request)

          if (!access.isSuperadmin && !access.permissions.includes('manage_users')) {
            return Response.json({ error: 'Manage users permission required' }, { status: 403 })
          }

          const admin = getAdminOrRequestClient(request)

          const { data, error } = await admin.rpc('list_org_member_roles')

          if (error) {
            return Response.json({ error: error.message }, { status: 500 })
          }

          const roleRows = Array.isArray(data) ? ((data as RoleListRow[]) || []) : []
          const existingEmails = new Set(roleRows.map((row) => String(row.email || '').trim().toLowerCase()).filter(Boolean))

          let mergedRoles = [...roleRows]

          const inferredRows: RoleListRow[] = []

          let authUsers = await listAuthIndexedUsers(admin)

          // Always merge direct auth schema users when admin credentials are available.
          // This prevents stale public index data from hiding real signed-up members.
          if (hasSupabaseAdminConfig()) {
            const adminClient = getSupabaseAdminClient()
            const directAuthUsers: AuthUserListRow[] = []
            let page = 1
            const perPage = 1000

            while (page <= 10) {
              const { data: usersData, error: usersError } = await adminClient.auth.admin.listUsers({ page, perPage })
              if (usersError) break
              const pageUsers = (usersData?.users || []) as AuthUserListRow[]
              if (!pageUsers.length) break
              directAuthUsers.push(...pageUsers)
              if (pageUsers.length < perPage) break
              page += 1
            }

            if (directAuthUsers.length > 0) {
              const mergedAuthByEmail = new Map<string, AuthUserLite>()

              for (const indexedUser of authUsers) {
                const email = String(indexedUser.email || '').trim().toLowerCase()
                if (!email) continue
                mergedAuthByEmail.set(email, {
                  id: String(indexedUser.id || email),
                  email,
                  created_at: indexedUser.created_at || indexedUser.updated_at || new Date().toISOString(),
                  updated_at: indexedUser.updated_at || indexedUser.created_at || new Date().toISOString(),
                  user_metadata: indexedUser.user_metadata as Record<string, unknown> | null,
                })
              }

              for (const directUser of directAuthUsers) {
                const email = String(directUser.email || '').trim().toLowerCase()
                if (!email) continue

                mergedAuthByEmail.set(email, {
                  id: String(directUser.id || email),
                  email,
                  created_at: directUser.created_at || directUser.updated_at || new Date().toISOString(),
                  updated_at: directUser.updated_at || directUser.created_at || new Date().toISOString(),
                  user_metadata: (directUser.user_metadata || null) as Record<string, unknown> | null,
                })
              }

              authUsers = Array.from(mergedAuthByEmail.values()).map((user) => ({
                id: user.id,
                email: user.email,
                created_at: user.created_at,
                updated_at: user.updated_at,
                user_metadata: user.user_metadata,
                identities: null,
              }))
            }
          }

          if (authUsers.length === 0 && hasSupabaseAdminConfig()) {
            const adminClient = getSupabaseAdminClient()
            const fallbackUsers: AuthUserListRow[] = []
            let page = 1
            const perPage = 1000

            while (page <= 10) {
              const { data: usersData, error: usersError } = await adminClient.auth.admin.listUsers({ page, perPage })
              if (usersError) break
              const pageUsers = (usersData?.users || []) as AuthUserListRow[]
              if (!pageUsers.length) break
              fallbackUsers.push(...pageUsers)
              if (pageUsers.length < perPage) break
              page += 1
            }

            authUsers = fallbackUsers.map((user) => ({
              id: String(user.id || user.email || '').toLowerCase(),
              email: user.email,
              created_at: user.created_at,
              updated_at: user.updated_at || user.created_at,
              user_metadata: user.user_metadata || null,
              identities: null,
            }))
          }

          const authUsersByEmail = new Map(
            authUsers
              .map((user) => [String(user.email || '').trim().toLowerCase(), user] as const)
              .filter(([email]) => Boolean(email)),
          )

          const permissionCache = new Map<OrgRole, string[]>()
          const collectPermissionsForRole = async (targetRole: OrgRole) => {
            if (permissionCache.has(targetRole)) {
              return permissionCache.get(targetRole) || []
            }

            const { data: permsData, error: permsError } = await admin.rpc('list_org_permissions_for_role', {
              p_role: targetRole,
            })

            if (permsError) {
              permissionCache.set(targetRole, [])
              return []
            }

            const keys = Array.isArray(permsData)
              ? permsData
                  .map((row) => String((row as { permission_key?: unknown })?.permission_key || '').trim())
                  .filter(Boolean)
              : []

            permissionCache.set(targetRole, keys)
            return keys
          }

          const indexInferredRows = authUsers
            .map((row) => {
              const email = String(row.email || '').trim().toLowerCase()
              if (!email || existingEmails.has(email)) return null
              existingEmails.add(email)

              const createdAt = row.created_at || row.updated_at || new Date().toISOString()
              const updatedAt = row.updated_at || row.created_at || createdAt

              return {
                email,
                role: 'user' as OrgRole,
                granted_by: null,
                banned_by: null,
                ban_reason: null,
                banned_until: null,
                created_at: createdAt,
                updated_at: updatedAt,
                user_id: String(row.id || '').trim() || null,
                display_name: getDisplayName((row.user_metadata as Record<string, unknown> | null) || null),
                membership_plan: toStringOrNull((row.user_metadata as Record<string, unknown> | null)?.membership_plan),
                stripe_customer_id: toStringOrNull((row.user_metadata as Record<string, unknown> | null)?.stripe_customer_id),
                stripe_subscription_id: toStringOrNull((row.user_metadata as Record<string, unknown> | null)?.stripe_subscription_id),
              }
            })
            .filter((row): row is RoleListRow => Boolean(row))

          inferredRows.push(...indexInferredRows)

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

          mergedRoles = [...roleRows, ...inferredRows]

          mergedRoles = await Promise.all(
            mergedRoles.map(async (row) => {
              const email = String(row.email || '').trim().toLowerCase()
              const authUser = authUsersByEmail.get(email)
              const userMetadata = (authUser?.user_metadata as Record<string, unknown> | null) || null
              const effectivePermissions = await collectPermissionsForRole(row.role)

              return {
                ...row,
                email,
                user_id: row.user_id || String(authUser?.id || '').trim() || null,
                display_name: row.display_name || getDisplayName(userMetadata),
                membership_plan:
                  row.membership_plan ||
                  toStringOrNull(userMetadata?.membership_plan) ||
                  'free',
                stripe_customer_id:
                  row.stripe_customer_id ||
                  toStringOrNull(userMetadata?.stripe_customer_id),
                stripe_subscription_id:
                  row.stripe_subscription_id ||
                  toStringOrNull(userMetadata?.stripe_subscription_id),
                effective_permissions: effectivePermissions,
              }
            }),
          )

          mergedRoles.sort((a, b) => a.email.localeCompare(b.email))

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
          const admin = getAdminOrRequestClient(request)
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
      PUT: async ({ request }) => {
        try {
          const access = await requirePermission(request, 'manage_users')
          const admin = getAdminOrRequestClient(request)
          const body = await request.json()
          const parsed = setSubscriptionSchema.safeParse(body)

          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          if (!hasSupabaseAdminConfig()) {
            return Response.json(
              {
                error: 'Supabase admin configuration missing on server.',
                details: getSupabaseAdminConfigIssues(),
              },
              { status: 500 },
            )
          }

          const normalizedEmail = parsed.data.targetEmail.toLowerCase()
          const membershipPlan = parsed.data.membershipPlan.toLowerCase()

          const { data: currentMember, error: currentMemberError } = await admin
            .from('org_user_roles')
            .select('role')
            .eq('email', normalizedEmail)
            .maybeSingle()

          if (currentMemberError) {
            return Response.json({ error: currentMemberError.message }, { status: 500 })
          }

          if (currentMember?.role && !canManageRole(access.role, currentMember.role as OrgRole)) {
            return Response.json({ error: 'You cannot change a member at your role level or above' }, { status: 403 })
          }

          const { data: planRows, error: planError } = await admin
            .from('org_shop_membership_plans')
            .select('slug, is_active')

          if (planError) {
            return Response.json({ error: planError.message }, { status: 500 })
          }

          const allowedPlans = Array.from(new Set([
            'free',
            ...((planRows || []) as Array<{ slug?: string; is_active?: boolean }>)
              .filter((plan) => plan.is_active !== false)
              .map((plan) => String(plan.slug || '').trim().toLowerCase())
              .filter(Boolean),
          ]))

          if (!allowedPlans.includes(membershipPlan)) {
            return Response.json({ error: 'Invalid membership plan selected.' }, { status: 400 })
          }

          const authUser = await findAuthUserByEmail(normalizedEmail)
          if (!authUser?.id) {
            return Response.json({ error: 'Target auth user not found' }, { status: 404 })
          }

          const currentMeta = ((authUser.user_metadata as Record<string, unknown> | null | undefined) ?? {})
          const nextMeta: Record<string, unknown> = {
            ...currentMeta,
            membership_plan: membershipPlan,
          }

          if (membershipPlan === 'free') {
            nextMeta.stripe_subscription_id = null
          }

          const adminClient = getSupabaseAdminClient()
          const { error: updateError } = await adminClient.auth.admin.updateUserById(authUser.id, {
            user_metadata: nextMeta,
          })

          if (updateError) {
            return Response.json({ error: updateError.message }, { status: 500 })
          }

          return Response.json({
            updated: {
              email: normalizedEmail,
              membership_plan: membershipPlan,
              stripe_subscription_id: membershipPlan === 'free' ? null : (nextMeta.stripe_subscription_id || null),
            },
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
