import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL
// Server admin client MUST use the service role key — never a public/anon key.
const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Singleton — avoids creating a new TCP connection on every request
let adminClient: ReturnType<typeof createClient> | null = null

export function getSupabaseAdminClient() {
  if (!supabaseUrl) {
    throw new Error('Missing Supabase URL. Set SUPABASE_URL, VITE_SUPABASE_URL, or NEXT_PUBLIC_SUPABASE_URL.')
  }

  if (!serverKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY. The admin client requires the service role key — do not use anon/publishable keys here.'
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
