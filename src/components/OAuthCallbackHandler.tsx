import { useEffect, useState } from 'react'
import { getSupabaseBrowserClient } from '../lib/supabaseBrowser'

/**
 * OAuthCallbackHandler detects OAuth identity linking tokens in the URL hash
 * and processes them. This handles the redirect from Supabase after identity linking
 * completes (e.g., when linking a Kick account to an existing account).
 *
 * After successful token exchange, the user's identities are updated and they're
 * redirected back to the settings page.
 */
export function OAuthCallbackHandler() {
  const [processed, setProcessed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || processed) return

    const handleCallback = async () => {
      try {
        // Check if there are OAuth tokens in the hash
        const hash = window.location.hash.slice(1)
        if (!hash) return

        const params = new URLSearchParams(hash)
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')

        // Identity linking flow: tokens indicate a successful OAuth identity linking
        if (accessToken && refreshToken) {
          const supabase = getSupabaseBrowserClient()

          // Update the session with the new tokens from identity linking
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })

          if (error) {
            console.error('Failed to set session after identity linking:', error)
            return
          }

          // Get the current user to verify the linking worked
          const { data } = await supabase.auth.getUser()
          if (data?.user) {
            console.log('Identity linking successful. User identities:', data.user.identities)

            // Get the linked provider from the URL search params
            const urlParams = new URLSearchParams(window.location.search)
            const linkedProvider = urlParams.get('linked') || 'unknown'

            setProcessed(true)

            // Redirect back to settings, clearing the hash
            // Use window.location to force a page reload with fresh user state
            const redirectUrl = `/dashboard?view=settings&linked=${linkedProvider}`
            window.location.href = redirectUrl
          }
        }
      } catch (err) {
        console.error('OAuth callback handler error:', err)
      }
    }

    void handleCallback()
  }, [processed])

  return null
}
