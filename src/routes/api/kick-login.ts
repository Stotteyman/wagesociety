import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/kick-login')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const redirectTo = url.searchParams.get('redirect_to') || `${process.env.VITE_AUTH_REDIRECT_ORIGIN || process.env.NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN || 'http://localhost:3000'}/auth/callback`

          const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
          if (!supabaseUrl) {
            return new Response('Missing SUPABASE_URL', { status: 500 })
          }

          const authorizeUrl = new URL(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/authorize`)
          authorizeUrl.searchParams.set('provider', 'custom:kick')
          authorizeUrl.searchParams.set('redirect_to', redirectTo)

          return Response.redirect(authorizeUrl.toString(), 302)
        } catch (err) {
          return new Response(String(err instanceof Error ? err.message : 'Kick login failed'), { status: 500 })
        }
      },
    },
  },
})
