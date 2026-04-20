export const ORG_ROLES = [
  'superadmin',
  'admin',
  'manager',
  'staff',
  'moderator',
  'helper',
  'user',
  'banned',
] as const

export type OrgRole = (typeof ORG_ROLES)[number]

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Staff',
  moderator: 'Moderator',
  helper: 'Helper',
  user: 'User',
  banned: 'Banned',
}

export const ORG_ROLE_RANK: Record<OrgRole, number> = {
  superadmin: 0,
  admin: 1,
  manager: 2,
  staff: 3,
  moderator: 4,
  helper: 5,
  user: 6,
  banned: 7,
}

export type OrgPermission =
  | 'view_dashboard'
  | 'view_creator_tools'
  | 'view_revenue_tracker'
  | 'view_live_streams'
  | 'manage_livestreams'
  | 'view_merch'
  | 'manage_users'
  | 'manage_permissions'
  | 'access_admin_dashboard'

export type BanRecord = {
  bannedBy: string | null
  banReason: string | null
  bannedUntil: string | null
}

export function isOrgRole(value: string): value is OrgRole {
  return ORG_ROLES.includes(value as OrgRole)
}

export function canManageRole(actorRole: OrgRole, targetRole: OrgRole) {
  if (actorRole === 'superadmin') {
    return true
  }

  if (actorRole === 'banned') {
    return false
  }

  return ORG_ROLE_RANK[actorRole] < ORG_ROLE_RANK[targetRole]
}

export function formatRoleLabel(role: OrgRole) {
  return ORG_ROLE_LABELS[role]
}