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

        if (errorParam) {
          return Response.redirect(buildAuthRedirectUrl(authOrigin, '/dashboard?error=kick_oauth_denied'), 302)
        }

        // CSRF state check
        const cookieHeader = request.headers.get('cookie') || ''
        const cookieState = cookieHeader
          .split(';')
          .map((c) => c.trim())
          .find((c) => c.startsWith('kick_oauth_state='))
          ?.replace('kick_oauth_state=', '')

        if (!state || !cookieState || state !== cookieState) {
          return Response.redirect(buildAuthRedirectUrl(authOrigin, '/dashboard?error=kick_oauth_invalid_state'), 302)
        }

        if (!code) {
          return Response.redirect(buildAuthRedirectUrl(authOrigin, '/dashboard?error=kick_oauth_no_code'), 302)
        }

        const clientId = process.env.KICK_CLIENT_ID
        const clientSecret = process.env.KICK_CLIENT_SECRET
        const redirectUri =
          process.env.KICK_REDIRECT_URI || buildAuthRedirectUrl(authOrigin, '/api/kick-callback')

        if (!clientId || !clientSecret) {
          return Response.redirect(buildAuthRedirectUrl(authOrigin, '/dashboard?error=kick_not_configured'), 302)
        }

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

          if (!tokenResponse.ok) {
            return Response.redirect(buildAuthRedirectUrl(authOrigin, '/dashboard?error=kick_token_exchange_failed'), 302)
          }

          const tokens = (await tokenResponse.json()) as KickTokenResponse

          // Fetch Kick user profile
          const profileResponse = await fetch('https://kick.com/api/v1/user', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          })

          if (!profileResponse.ok) {
            return Response.redirect(buildAuthRedirectUrl(authOrigin, '/dashboard?error=kick_profile_fetch_failed'), 302)
          }

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

            if (createError || !newUser.user) {
              return Response.redirect(buildAuthRedirectUrl(authOrigin, '/dashboard?error=kick_account_create_failed'), 302)
            }

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

          if (linkError || !linkData?.properties?.action_link) {
            return Response.redirect(buildAuthRedirectUrl(authOrigin, '/dashboard?error=kick_session_create_failed'), 302)
          }

          const clearCookie =
            'kick_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
          const redirect = Response.redirect(linkData.properties.action_link, 302)
          redirect.headers.set('Set-Cookie', clearCookie)
          return redirect
        } catch {
          return Response.redirect(buildAuthRedirectUrl(authOrigin, '/dashboard?error=kick_unexpected_error'), 302)
        }
      },
    },
  },
})
