import { canManageRole, isOrgRole, type BanRecord, type OrgPermission, type OrgRole } from './orgAccess'
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from './supabaseAdmin'
import { getSupabaseServerPublicClient } from './supabaseServer'

const OWNER_SUPERADMIN_EMAILS = new Set(['stotteyman@gmail.com'])
const SUPERADMIN_FALLBACK_PERMISSIONS: OrgPermission[] = [
  'view_dashboard',
  'view_creator_tools',
  'view_revenue_tracker',
  'view_live_streams',
  'use_autoclipper',
  'manage_livestreams',
  'view_merch',
  'manage_users',
  'manage_permissions',
  'access_admin_dashboard',
]

export async function resolveRequester(request: Request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

  if (!token) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // JWT verification works with either the service-role client or the public client.
  // Fall back to the public client so local dev without SUPABASE_SERVICE_ROLE_KEY still works.
  const authClient = hasSupabaseAdminConfig() ? getSupabaseAdminClient() : getSupabaseServerPublicClient()
  const { data, error } = await authClient.auth.getUser(token)
  const email = data.user?.email?.toLowerCase()

  if (error || !email) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return {
    email,
    source: 'supabase-auth' as const,
  }
}

export async function resolveOrgRole(email: string): Promise<OrgRole> {
  const normalizedEmail = email.toLowerCase()

  if (OWNER_SUPERADMIN_EMAILS.has(normalizedEmail)) {
    if (!hasSupabaseAdminConfig()) {
      return 'superadmin'
    }

    const admin = getSupabaseAdminClient()
    const { error } = await admin.rpc('set_org_member_role', {
      p_target_email: normalizedEmail,
      p_role: 'superadmin',
      p_granted_by: 'system:owner-bootstrap',
    })

    if (error) {
      return 'superadmin'
    }

    return 'superadmin'
  }

  if (!hasSupabaseAdminConfig()) {
    // Without the service role key we can't query the DB for the member's role.
    // Fall back to 'user' so authenticated members can still access the platform
    // with default permissions. Superadmin and owner emails are already handled above.
    return 'user'
  }

  const admin = getSupabaseAdminClient()

  const { data, error } = await admin.rpc('ensure_org_member_role', {
    p_email: normalizedEmail,
  })

  if (error || !data) {
    throw new Response(JSON.stringify({ error: `Role resolution failed: ${error?.message || 'Unknown error'}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!isOrgRole(data)) {
    throw new Response(JSON.stringify({ error: 'Invalid role in role resolution' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return data
}

export async function getRolePermissions(role: OrgRole): Promise<OrgPermission[]> {
  if (role === 'banned') {
    return []
  }

  if (!hasSupabaseAdminConfig()) {
    return role === 'superadmin' ? SUPERADMIN_FALLBACK_PERMISSIONS : []
  }

  const admin = getSupabaseAdminClient()

  const { data, error } = await admin.rpc('list_org_permissions_for_role', {
    p_role: role,
  })

  if (error) {
    if (role === 'superadmin') {
      return SUPERADMIN_FALLBACK_PERMISSIONS
    }

    throw new Response(JSON.stringify({ error: `Permission lookup failed: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return ((data || []) as Array<{ permission_key: OrgPermission }>).map((row) => row.permission_key)
}

export async function getBanRecord(email: string): Promise<BanRecord | null> {
  const admin = getSupabaseAdminClient()

  const { data, error } = await admin
    .from('org_user_roles')
    .select('banned_by, ban_reason, banned_until')
    .eq('email', email.toLowerCase())
    .maybeSingle()

  if (error) {
    throw new Response(JSON.stringify({ error: `Ban lookup failed: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!data) {
    return null
  }

  return {
    bannedBy: data.banned_by,
    banReason: data.ban_reason,
    bannedUntil: data.banned_until,
  }
}

function resolveViewAsRole(request: Request, actorRole: OrgRole): OrgRole | null {
  const rawViewAsRole = request.headers.get('x-view-as-role')?.toLowerCase() || ''

  if (!rawViewAsRole || !isOrgRole(rawViewAsRole)) {
    return null
  }

  if (actorRole === 'banned') {
    return null
  }

  if (actorRole === 'superadmin') {
    return rawViewAsRole
  }

  if (!canManageRole(actorRole, 'user')) {
    return null
  }

  return canManageRole(actorRole, rawViewAsRole) ? rawViewAsRole : null
}

export async function getRequesterAccess(request: Request) {
  const requester = await resolveRequester(request)
  const actorRole = await resolveOrgRole(requester.email)
  const viewAsRole = resolveViewAsRole(request, actorRole)
  const role = viewAsRole || actorRole

  if (actorRole === 'banned') {
    return {
      requester,
      role,
      actorRole,
      viewingAs: viewAsRole,
      permissions: [] as OrgPermission[],
      isSuperadmin: false,
      ban: await getBanRecord(requester.email),
    }
  }

  if (role === 'superadmin') {
    const allPermissions = await getRolePermissions('superadmin')
    return {
      requester,
      role,
      actorRole,
      viewingAs: viewAsRole,
      permissions: allPermissions,
      isSuperadmin: true,
      ban: null,
    }
  }

  const permissions = await getRolePermissions(role)

  return {
    requester,
    role,
    actorRole,
    viewingAs: viewAsRole,
    permissions,
    isSuperadmin: false,
    ban: null,
  }
}

export async function requirePermission(request: Request, permission: OrgPermission) {
  const access = await getRequesterAccess(request)

  if (access.role === 'banned') {
    throw new Response(JSON.stringify({ error: 'Banned accounts have no platform access' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (access.isSuperadmin) {
    return access
  }

  if (!access.permissions.includes(permission)) {
    throw new Response(JSON.stringify({ error: `Missing permission: ${permission}` }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return access
}
