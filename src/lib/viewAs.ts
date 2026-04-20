import { isOrgRole, type OrgRole } from './orgAccess'

export const VIEW_AS_ROLE_STORAGE_KEY = 'wage_society_view_as_role'

export function getStoredViewAsRole(): OrgRole | null {
  if (typeof window === 'undefined') return null

  const value = window.localStorage.getItem(VIEW_AS_ROLE_STORAGE_KEY)
  if (!value || !isOrgRole(value)) {
    return null
  }

  return value
}

export function setStoredViewAsRole(role: OrgRole | null) {
  if (typeof window === 'undefined') return

  if (!role) {
    window.localStorage.removeItem(VIEW_AS_ROLE_STORAGE_KEY)
    return
  }

  window.localStorage.setItem(VIEW_AS_ROLE_STORAGE_KEY, role)
}
