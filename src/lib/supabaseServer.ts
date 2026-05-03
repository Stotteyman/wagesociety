import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const publishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let serverPublicClient: ReturnType<typeof createClient> | null = null

export function getSupabaseServerPublicClient() {
  if (!supabaseUrl) {
    throw new Error('Missing Supabase URL. Set SUPABASE_URL or VITE_SUPABASE_URL.')
  }

  if (!publishableKey) {
    throw new Error('Missing Supabase publishable key. Set VITE_SUPABASE_PUBLISHABLE_KEY.')
  }

  if (!serverPublicClient) {
    serverPublicClient = createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  }

  return serverPublicClient
}