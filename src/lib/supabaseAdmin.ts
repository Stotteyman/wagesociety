import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL
// Server admin client MUST use the service role key — never a public/anon key.
const serverKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE

// Singleton — avoids creating a new TCP connection on every request
let adminClient: ReturnType<typeof createClient> | null = null

export function hasSupabaseAdminConfig() {
  return Boolean(supabaseUrl && serverKey)
}

export function getSupabaseAdminConfigIssues() {
  const issues: string[] = []
  if (!supabaseUrl) {
    issues.push('Missing Supabase URL. Set SUPABASE_URL, VITE_SUPABASE_URL, or NEXT_PUBLIC_SUPABASE_URL.')
  }
  if (!serverKey) {
    issues.push(
      'Missing service role key. Set SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY, SUPABASE_SECRET_KEY, or SUPABASE_SERVICE_ROLE. The admin client requires a server-only key — do not use anon/publishable keys here.',
    )
  }
  return issues
}

export function getSupabaseAdminClient() {
  if (!hasSupabaseAdminConfig()) {
    throw new Error(getSupabaseAdminConfigIssues().join(' '))
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
