const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1'])

function normalizePath(path: string): string {
  if (!path) return '/'
  return path.startsWith('/') ? path : `/${path}`
}

export function normalizeAuthOrigin(origin: string): string {
  try {
    const parsed = new URL(origin)
    if (LOCALHOST_HOSTS.has(parsed.hostname) && parsed.port !== '3000') {
      parsed.port = '3000'
    }
    return parsed.origin
  } catch {
    return origin
  }
}

export function buildAuthRedirectUrl(origin: string, path: string): string {
  return `${normalizeAuthOrigin(origin)}${normalizePath(path)}`
}

export function getClientAuthRedirectUrl(path: string): string {
  if (typeof window === 'undefined') return path
  return buildAuthRedirectUrl(window.location.origin, path)
}