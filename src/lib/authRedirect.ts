function normalizePath(path: string): string {
  if (!path) return '/'
  return path.startsWith('/') ? path : `/${path}`
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = String(hostname || '').trim().toLowerCase()
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === '[::1]' || normalized === '0.0.0.0'
}

export function normalizeAuthOrigin(origin: string): string {
  try {
    const parsed = new URL(origin)

    // Keep OAuth redirect origins stable in local development.
    // Supabase often has localhost allowlisted, while users may open 127.0.0.1.
    if (isLoopbackHost(parsed.hostname)) {
      return `${parsed.protocol}//localhost${parsed.port ? `:${parsed.port}` : ''}`
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

  const configuredOrigin = String(import.meta.env.VITE_AUTH_REDIRECT_ORIGIN || '').trim()
  const origin = configuredOrigin || window.location.origin

  return buildAuthRedirectUrl(origin, path)
}