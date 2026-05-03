import { canManageRole, isOrgRole, type BanRecord, type OrgPermission, type OrgRole } from './orgAccess'
import { getSupabaseAdminClient } from './supabaseAdmin'

export const LOCAL_SUPERADMIN_EMAIL = 'root-superadmin@localhost'

export function isLocalRequest(request: Request) {
  const host = request.headers.get('host') || ''
  return host.includes('localhost') || host.includes('127.0.0.1')
}

export async function resolveRequester(request: Request) {
  // Localhost bypass is disabled by default. Enable only for explicit local dev
  // by setting ALLOW_LOCALHOST_SUPERADMIN=true in your .env file.
  if (isLocalRequest(request) && process.env.ALLOW_LOCALHOST_SUPERADMIN === 'true') {
    return {
      email: LOCAL_SUPERADMIN_EMAIL,
      source: 'localhost-bypass' as const,
    }
  }

  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

  if (!token) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.auth.getUser(token)
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
  const admin = getSupabaseAdminClient()

  if (email === LOCAL_SUPERADMIN_EMAIL) {
    const { error } = await admin.rpc('set_org_member_role', {
      p_target_email: LOCAL_SUPERADMIN_EMAIL,
      p_role: 'superadmin',
      p_granted_by: 'system:localhost-root',
    })

    if (error) {
      throw new Response(
        JSON.stringify({ error: `Localhost superadmin bootstrap failed: ${error.message}` }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    return 'superadmin'
  }

  const { data, error } = await admin.rpc('ensure_org_member_role', {
    p_email: email,
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

export async function requireAdminRole(request: Request) {
  const requester = await resolveRequester(request)
  const role = await resolveOrgRole(requester.email)

  if (!canManageRole(role, 'user')) {
    throw new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return { requester, role }
}

export async function requireSuperadminRole(request: Request) {
  const requester = await resolveRequester(request)
  const role = await resolveOrgRole(requester.email)

  if (role !== 'superadmin') {
    throw new Response(JSON.stringify({ error: 'Superadmin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return { requester, role }
}

export async function getRolePermissions(role: OrgRole): Promise<OrgPermission[]> {
  if (role === 'banned') {
    return []
  }

  const admin = getSupabaseAdminClient()

  const { data, error } = await admin.rpc('list_org_permissions_for_role', {
    p_role: role,
  })

  if (error) {
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
