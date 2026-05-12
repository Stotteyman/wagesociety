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

  const postPopupResult = (payload: {
    status: 'success' | 'error'
    provider: string
    accessToken?: string
    refreshToken?: string
    message?: string
  }) => {
    if (!window.opener || window.opener.closed) return

    window.opener.postMessage(
      {
        type: 'oauth-link-complete',
        ...payload,
      },
      window.location.origin,
    )
  }

  useEffect(() => {
    if (typeof window === 'undefined' || processed) return

    const handleCallback = async () => {
      try {
        // This handler is for identity-linking callbacks only.
        // Normal OAuth login callbacks should continue through the standard auth flow.
        const urlParams = new URLSearchParams(window.location.search)
        const linkedProvider = urlParams.get('linked')
        console.log('[OAuthCallbackHandler] URL search:', window.location.search)
        console.log('[OAuthCallbackHandler] linkedProvider:', linkedProvider)
        if (!linkedProvider) return

        const supabase = getSupabaseBrowserClient()

        // Check if there are OAuth tokens in the hash
        const hash = window.location.hash.slice(1)
        const code = urlParams.get('code')
        console.log('[OAuthCallbackHandler] hash:', hash)
        console.log('[OAuthCallbackHandler] code:', code)

        let accessToken: string | null = null
        let refreshToken: string | null = null

        if (hash) {
          const params = new URLSearchParams(hash)
          accessToken = params.get('access_token')
          refreshToken = params.get('refresh_token')
          console.log('[OAuthCallbackHandler] Extracted tokens from hash:', { hasAccessToken: !!accessToken, hasRefreshToken: !!refreshToken })
        }

        if (!accessToken && !refreshToken && code) {
          console.log('[OAuthCallbackHandler] Exchanging code for session')
          const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            console.error('[OAuthCallbackHandler] Code exchange error:', exchangeError)
            postPopupResult({
              status: 'error',
              provider: linkedProvider,
              message: exchangeError.message,
            })
            return
          }

          accessToken = exchangeData.session?.access_token || null
          refreshToken = exchangeData.session?.refresh_token || null
          console.log('[OAuthCallbackHandler] Code exchange success:', { hasAccessToken: !!accessToken, hasRefreshToken: !!refreshToken })
        }

        // Identity linking flow: tokens indicate a successful OAuth identity linking
        if (accessToken && refreshToken) {
          console.log('[OAuthCallbackHandler] Setting session with tokens')
          // Update the session with the new tokens from identity linking
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })

          if (error) {
            console.error('[OAuthCallbackHandler] Failed to set session:', error)
            postPopupResult({
              status: 'error',
              provider: linkedProvider,
              message: error.message,
            })
            return
          }

          // Get the current user to verify the linking worked
          const { data } = await supabase.auth.getUser()
          if (data?.user) {
            console.log('[OAuthCallbackHandler] Identity linking successful. User identities:', data.user.identities)

            setProcessed(true)

            const redirectUrl = `/settings?linked=${linkedProvider}`

            // Popup flow for Kick linking: signal opener then close itself.
            if (window.opener && !window.opener.closed) {
              console.log('[OAuthCallbackHandler] Posting success to opener and closing popup')
              postPopupResult({
                status: 'success',
                provider: linkedProvider,
                accessToken,
                refreshToken,
              })
              window.close()
              return
            }

            // Redirect back to settings, clearing the hash
            // Use window.location to force a page reload with fresh user state
            window.location.href = redirectUrl
          }
          return
        }

        // Some providers/flows can complete without exposing hash tokens after exchange.
        // If we can resolve a signed-in user here, treat linking as successful.
        const { data: fallbackUserData, error: fallbackUserError } = await supabase.auth.getUser()
        if (fallbackUserError || !fallbackUserData?.user) {
          postPopupResult({
            status: 'error',
            provider: linkedProvider,
            message: fallbackUserError?.message || 'OAuth callback completed without a valid session.',
          })
          return
        }

        setProcessed(true)
        const redirectUrl = `/settings?linked=${linkedProvider}`

        if (window.opener && !window.opener.closed) {
          postPopupResult({
            status: 'success',
            provider: linkedProvider,
          })
          window.close()
          return
        }

        window.location.href = redirectUrl
      } catch (err) {
        console.error('OAuth callback handler error:', err)
        if (typeof window !== 'undefined') {
          const linkedProvider = new URLSearchParams(window.location.search).get('linked') || 'unknown'
          postPopupResult({
            status: 'error',
            provider: linkedProvider,
            message: err instanceof Error ? err.message : 'OAuth callback processing failed.',
          })
        }
      }
    }

    void handleCallback()
  }, [processed])

  return null
}
