import { createClient } from '@supabase/supabase-js'
import { getStoredViewAsRole } from './viewAs'

let supabaseBrowserClient: ReturnType<typeof createClient> | null = null

export function getSupabaseBrowserClient() {
  if (supabaseBrowserClient) return supabaseBrowserClient

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabasePublishableKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      'Missing Supabase browser env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
    )
  }

  supabaseBrowserClient = createClient(supabaseUrl, supabasePublishableKey)
  return supabaseBrowserClient
}

export async function getSupabaseAccessToken() {
  const supabase = getSupabaseBrowserClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || null
}

export async function authedFetch(input: string, init?: RequestInit) {
  const token = await getSupabaseAccessToken()
  const headers = new Headers(init?.headers)
  const viewAsRole = getStoredViewAsRole()

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  if (viewAsRole) {
    headers.set('x-view-as-role', viewAsRole)
  }

  return fetch(input, {
    ...init,
    headers,
  })
}

type OAuthUrlOptions = {
  scopes?: string
  queryParams?: Record<string, string>
}

export const KICK_OAUTH_QUERY_PARAMS = {
  prompt: 'consent',
} as const

type KickOAuthOptions = {
  scopes?: string
  queryParams?: Record<string, string>
}

export function getKickOAuthOptions(): KickOAuthOptions {
  const prompt = String(import.meta.env.VITE_KICK_OAUTH_PROMPT || KICK_OAUTH_QUERY_PARAMS.prompt).trim()

  const options: KickOAuthOptions = {}
  if (prompt) {
    options.queryParams = {
      prompt,
    }
  }

  return options
}

export function normalizeOAuthProviderKey(provider: string) {
  const normalized = String(provider || '').trim().toLowerCase()
  return normalized === 'custom:kick' ? 'kick' : normalized
}

export function isKickOAuthProvider(provider: string) {
  const normalized = String(provider || '').trim().toLowerCase()
  return normalized === 'kick' || normalized === 'custom:kick'
}

export function getKickOAuthProviderCandidates() {
  return ['custom:kick'] as const
}

export function isMalformedKickOAuthUrl(url: string) {
  const raw = String(url || '')
  return raw.includes('https//id.kick.com') || raw.includes('kick.comhttps//')
}

export function normalizeKickOAuthUrl(url: string) {
  const raw = String(url || '')
  return raw
    .replace('https://kick.comhttps//id.kick.com', 'https://id.kick.com')
    .replace('https://kick.comhttps://id.kick.com', 'https://id.kick.com')
    .replace('https//id.kick.com', 'https://id.kick.com')
}

export function ensureKickOAuthRedirect(url: string, redirectTo: string) {
  const normalized = normalizeKickOAuthUrl(url)
  const target = String(redirectTo || '').trim()
  if (!target) return normalized

  try {
    const parsed = new URL(normalized)

    // Kick frequently wraps /oauth/authorize inside /login?redirect=... .
    // Ensure redirect_to is present in that nested authorize URL.
    const nestedRedirect = parsed.searchParams.get('redirect')
    if (nestedRedirect) {
      const authorizeUrl = new URL(nestedRedirect, `${parsed.origin}/`)
      if (!authorizeUrl.searchParams.get('redirect_to')) {
        authorizeUrl.searchParams.set('redirect_to', target)
      }
      parsed.searchParams.set('redirect', `${authorizeUrl.pathname}${authorizeUrl.search}`)
      return parsed.toString()
    }

    if (!parsed.searchParams.get('redirect_to')) {
      parsed.searchParams.set('redirect_to', target)
    }

    return parsed.toString()
  } catch {
    return normalized
  }
}

/**
 * Initiates OAuth identity linking by calling Supabase's GoTrue endpoint directly
 * with the user's current access token. This is more reliable than
 * supabase.auth.linkIdentity() in SSR / TanStack Start contexts where the
 * Supabase JS client's internal session may not be fully hydrated.
 *
 * Returns the OAuth provider URL to redirect the browser to.
 */
export async function getIdentityLinkUrl(
  provider: string,
  redirectTo: string,
  options?: OAuthUrlOptions,
): Promise<string> {
  const supabase = getSupabaseBrowserClient()
  const normalizedProvider = String(provider || '').trim().toLowerCase()
  const providerCandidates = Array.from(new Set([
    normalizedProvider,
    normalizedProvider.startsWith('custom:')
      ? normalizedProvider.slice('custom:'.length)
      : `custom:${normalizedProvider}`,
  ].filter(Boolean)))

  let lastError: string | null = null

  for (const candidate of providerCandidates) {
    const { data, error } = await (supabase.auth as any).linkIdentity({
      provider: candidate,
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        ...(options?.scopes ? { scopes: options.scopes } : {}),
        ...(options?.queryParams ? { queryParams: options.queryParams } : {}),
      },
    })

    if (data?.url) {
      return data.url
    }

    const errorMessage = error?.message || `Could not start ${candidate} account linking.`
    lastError = errorMessage

    // Continue trying alternate provider forms for custom providers.
    if (errorMessage.toLowerCase().includes('unsupported provider')) {
      continue
    }
  }

  throw new Error(lastError || `Could not start ${provider} account linking.`)
}
