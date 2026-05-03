import { redirect } from '@tanstack/react-router'
import { getSupabaseBrowserClient } from './supabaseBrowser'
import { isLocalRootSessionActive } from './localRootSession'

type RouteAuthOptions = {
  skipOnboardingCheck?: boolean
}

function needsOnboarding(metadata: Record<string, unknown> | undefined) {
  return metadata?.onboarding_completed !== true
}

export async function requireAuthenticatedRoute(redirectTo: string = '/login', options: RouteAuthOptions = {}) {
  if (typeof window === 'undefined') return

  if (isLocalRootSessionActive()) {
    return
  }

  const supabase = getSupabaseBrowserClient()
  const { data } = await supabase.auth.getSession()

  if (!data.session) {
    throw redirect({
      to: redirectTo,
    })
  }

  const user = data.session.user
  if (!options.skipOnboardingCheck && needsOnboarding(user.user_metadata as Record<string, unknown> | undefined)) {
    throw redirect({ to: '/onboarding' })
  }
}