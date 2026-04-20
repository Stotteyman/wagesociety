import { createFileRoute } from '@tanstack/react-router'

/**
 * GET /api/kick-login
 *
 * Initiates the Kick OAuth 2.0 Authorization Code flow.
 *
 * Required env vars:
 *   KICK_CLIENT_ID     — from https://kick.com/settings/developer
 *   KICK_REDIRECT_URI  — must be exactly: https://yourdomain.com/api/kick-callback
 */
export const Route = createFileRoute('/api/kick-login')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clientId = process.env.KICK_CLIENT_ID
        const redirectUri =
          process.env.KICK_REDIRECT_URI ||
          `${new URL(request.url).origin}/api/kick-callback`

        if (!clientId) {
          return Response.json({ error: 'Kick OAuth is not configured on this server.' }, { status: 500 })
        }

        const state = crypto.randomUUID()

        const params = new URLSearchParams({
          response_type: 'code',
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: 'user:read',
          state,
        })

        const authUrl = `https://kick.com/oauth/authorize?${params.toString()}`

        const response = Response.redirect(authUrl, 302)
        response.headers.set(
          'Set-Cookie',
          `kick_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
        )
        return response
      },
    },
  },
})
