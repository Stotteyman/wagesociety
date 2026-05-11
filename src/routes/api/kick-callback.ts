import { createFileRoute } from '@tanstack/react-router'
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin'
import { buildAuthRedirectUrl, normalizeAuthOrigin } from '../../lib/authRedirect'

type KickTokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope: string
}

type KickUserResponse = {
  id: number
  username: string
  email?: string
  profile_pic?: string
  name?: string
}

/** Returns an HTML page that posts a message to the opener and closes itself. */
function popupResponse(origin: string, payload: Record<string, unknown>, clearCookie: string) {
  const json = JSON.stringify({ type: 'kick-oauth-complete', ...payload })
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body><script>
try { window.opener && window.opener.postMessage(${json}, ${JSON.stringify(origin)}); } catch(e){}
window.close();
<\/script></body></html>`
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': clearCookie },
  })
}

/**
 * GET /api/kick-callback
 *
 * Handles the OAuth callback from Kick. Exchanges code for tokens,
 * fetches the Kick user profile, then creates or links the Supabase user
 * and issues a magic-link session redirect to /dashboard.
 *
 * Required env vars:
 *   KICK_CLIENT_ID
 *   KICK_CLIENT_SECRET
 *   KICK_REDIRECT_URI  — must be: https://yourdomain.com/api/kick-callback
 */
export const Route = createFileRoute('/api/kick-callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const authOrigin = normalizeAuthOrigin(url.origin)
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const errorParam = url.searchParams.get('error')
        const clearCookie = 'kick_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'

        // CSRF state check
        const cookieHeader = request.headers.get('cookie') || ''
        const cookieRaw = cookieHeader
          .split(';')
          .map((c) => c.trim())
          .find((c) => c.startsWith('kick_oauth_state='))
          ?.replace('kick_oauth_state=', '') ?? ''

        // Cookie stores "state|popup" e.g. "abc123|1" or legacy "abc123"
        const [cookieState, popupFlag] = cookieRaw.includes('|')
          ? cookieRaw.split('|', 2)
          : [cookieRaw, '0']
        const isPopup = popupFlag === '1'

        const errRedirect = (errCode: string) => {
          if (isPopup) return popupResponse(authOrigin, { status: 'error', error: errCode }, clearCookie)
          return Response.redirect(buildAuthRedirectUrl(authOrigin, `/dashboard?error=${errCode}`), 302)
        }

        if (errorParam) return errRedirect('kick_oauth_denied')

        if (!state || !cookieState || state !== cookieState) return errRedirect('kick_oauth_invalid_state')

        if (!code) return errRedirect('kick_oauth_no_code')

        const clientId = process.env.KICK_CLIENT_ID
        const clientSecret = process.env.KICK_CLIENT_SECRET
        const redirectUri =
          process.env.KICK_REDIRECT_URI || buildAuthRedirectUrl(authOrigin, '/api/kick-callback')

        if (!clientId || !clientSecret) return errRedirect('kick_not_configured')

        try {
          // Exchange code for access token
          const tokenResponse = await fetch('https://kick.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUri,
              code,
            }).toString(),
          })

          if (!tokenResponse.ok) return errRedirect('kick_token_exchange_failed')

          const tokens = (await tokenResponse.json()) as KickTokenResponse

          // Fetch Kick user profile
          const profileResponse = await fetch('https://kick.com/api/v1/user', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          })

          if (!profileResponse.ok) return errRedirect('kick_profile_fetch_failed')

          const kickUser = (await profileResponse.json()) as KickUserResponse

          // Use Kick email if available; otherwise synthesize a stable unique address
          const email = kickUser.email || `kick_${kickUser.id}@kick.wagesociety.local`

          const admin = getSupabaseAdminClient()

          // Check if user already exists in Supabase
          const { data: existingUsers } = await admin.auth.admin.listUsers()
          const existing = existingUsers?.users?.find((u) => u.email === email)

          if (existing) {
            const existingMeta = (existing.user_metadata as Record<string, unknown> | null | undefined) ?? {}
            await admin.auth.admin.updateUserById(existing.id, {
              user_metadata: {
                ...existingMeta,
                username: kickUser.username,
                full_name: kickUser.name || kickUser.username,
                avatar_url: kickUser.profile_pic || null,
                kick_username: kickUser.username,
                kick_id: kickUser.id,
                membership_plan: String(existingMeta.membership_plan || 'free'),
              },
            })
          } else {
            const { data: newUser, error: createError } = await admin.auth.admin.createUser({
              email,
              email_confirm: true,
              user_metadata: {
                username: kickUser.username,
                full_name: kickUser.name || kickUser.username,
                avatar_url: kickUser.profile_pic || null,
                kick_username: kickUser.username,
                kick_id: kickUser.id,
                membership_plan: 'free',
                onboarding_completed: false,
              },
            })

            if (createError || !newUser.user) return errRedirect('kick_account_create_failed')

            await (admin as any).rpc('ensure_org_member_role', {
              p_email: email,
              p_role: 'user',
            })
          }

          // Generate a magic link to issue a browser session
          const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
            type: 'magiclink',
            email,
            options: { redirectTo: buildAuthRedirectUrl(authOrigin, '/dashboard') },
          })

          if (linkError || !linkData?.properties?.action_link) return errRedirect('kick_session_create_failed')

          if (isPopup) {
            // In popup mode: send the magic link URL back so the opener can navigate
            return popupResponse(authOrigin, { status: 'success', kickUsername: kickUser.username, magicLink: linkData.properties.action_link }, clearCookie)
          }

          const redirect = Response.redirect(linkData.properties.action_link, 302)
          redirect.headers.set('Set-Cookie', clearCookie)
          return redirect
        } catch {
          return errRedirect('kick_unexpected_error')
        }
      },
    },
  },
})

