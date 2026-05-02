import { redirect } from '@tanstack/react-router'
import { getSupabaseBrowserClient } from './supabaseBrowser'

export async function requireAuthenticatedRoute(redirectTo: string = '/login') {
  if (typeof window === 'undefined') return

  const supabase = getSupabaseBrowserClient()
  const { data } = await supabase.auth.getSession()

  if (!data.session) {
    throw redirect({
      to: redirectTo,
    })
  }
}