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
