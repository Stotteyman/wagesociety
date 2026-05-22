import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/kick-callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const incoming = new URL(request.url)
          const redirectOrigin = process.env.VITE_AUTH_REDIRECT_ORIGIN || process.env.NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN || 'http://localhost:3000'

          // Forward query string to client-side auth callback route
          const forward = `${redirectOrigin.replace(/\/$/, '')}/auth/callback${incoming.search}`
          return Response.redirect(forward, 302)
        } catch (err) {
          return new Response(String(err instanceof Error ? err.message : 'Kick callback failed'), { status: 500 })
        }
      },
    },
  },
})
