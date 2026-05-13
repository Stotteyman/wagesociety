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

export const KICK_OAUTH_SCOPES = 'user:read'

export const KICK_OAUTH_QUERY_PARAMS: Record<string, string> = {
  prompt: 'consent',
}

type OAuthUrlOptions = {
  scopes?: string
  queryParams?: Record<string, string>
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
  const token = await getSupabaseAccessToken()
  if (!token) {
    throw new Error('No active session. Please log out and log back in, then try again.')
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const anonKey = (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY
  ) as string

  const params = new URLSearchParams({
    provider,
    redirect_to: redirectTo,
    skip_http_redirect: 'true',
  })

  if (options?.scopes) {
    params.set('scopes', options.scopes)
  }

  if (options?.queryParams) {
    for (const [key, value] of Object.entries(options.queryParams)) {
      params.set(key, value)
    }
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user/identities/authorize?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
    },
  })

  const data = (await response.json()) as { url?: string; error_description?: string; msg?: string; code?: string }

  if (!response.ok || !data.url) {
    throw new Error(data.error_description || data.msg || `Could not start ${provider} account linking.`)
  }

  return data.url
}
