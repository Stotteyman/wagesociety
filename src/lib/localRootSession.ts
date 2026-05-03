export const LOCAL_ROOT_EMAIL = 'root-superadmin@localhost'
const LOCAL_ROOT_SESSION_KEY = 'wage.localRootSession'

function isLocalhostHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

export function isLocalhostClient() {
  if (typeof window === 'undefined') return false
  return isLocalhostHost(window.location.hostname)
}

export function isLocalRootSessionActive() {
  if (!isLocalhostClient()) return false
  return window.localStorage.getItem(LOCAL_ROOT_SESSION_KEY) === 'true'
}

export function startLocalRootSession() {
  if (!isLocalhostClient()) return
  window.localStorage.setItem(LOCAL_ROOT_SESSION_KEY, 'true')
}

export function endLocalRootSession() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(LOCAL_ROOT_SESSION_KEY)
}

export function getLocalRootUser() {
  return {
    email: LOCAL_ROOT_EMAIL,
    user_metadata: {
      username: 'root',
      full_name: 'root',
    },
  }
}
