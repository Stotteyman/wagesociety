import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL
const serverKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

// Singleton — avoids creating a new TCP connection on every request
let adminClient: ReturnType<typeof createClient> | null = null

export function getSupabaseAdminClient() {
  if (!supabaseUrl) {
    throw new Error('Missing Supabase URL. Set SUPABASE_URL, VITE_SUPABASE_URL, or NEXT_PUBLIC_SUPABASE_URL.')
  }

  if (!serverKey) {
    throw new Error(
      'Missing Supabase server key. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY for role APIs.'
    )
  }

  if (!adminClient) {
    adminClient = createClient(supabaseUrl, serverKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  }

  return adminClient
}
