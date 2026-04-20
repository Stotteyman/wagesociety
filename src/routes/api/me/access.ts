import { createFileRoute } from '@tanstack/react-router'
import { getRequesterAccess } from '../../../lib/orgAuth'

export const Route = createFileRoute('/api/me/access')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const access = await getRequesterAccess(request)

          return Response.json({
            requester: access.requester,
            role: access.role,
            actorRole: access.actorRole,
            viewingAs: access.viewingAs,
            permissions: access.permissions,
            isSuperadmin: access.isSuperadmin,
            ban: access.ban,
          })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },
    },
  },
})
