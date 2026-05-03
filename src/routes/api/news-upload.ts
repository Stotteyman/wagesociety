import { createFileRoute } from '@tanstack/react-router'
import { getRequesterAccess, isLocalRequest } from '../../lib/orgAuth'
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../lib/supabaseAdmin'
import { getSupabaseServerClientForToken } from '../../lib/supabaseServer'

const WRITE_ROLES = new Set(['superadmin', 'admin', 'manager', 'staff', 'helper', 'user'])
const ALLOWED_IMAGES = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])
const ALLOWED_VIDEOS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv'])

export const Route = createFileRoute('/api/news-upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          let requesterEmail = ''
          let accessToken = ''

          if (hasSupabaseAdminConfig()) {
            const access = await getRequesterAccess(request)
            if (!WRITE_ROLES.has(access.role)) {
              return Response.json({ error: 'Insufficient permissions' }, { status: 403 })
            }
            requesterEmail = access.requester.email
          } else {
            const useLocalRoot = request.headers.get('x-local-root-session') === 'true' && isLocalRequest(request)
            if (!useLocalRoot) {
              const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || ''
              const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
              if (!token) {
                return Response.json({ error: 'Unauthorized' }, { status: 401 })
              }

              const client = getSupabaseServerClientForToken(token)
              const {
                data: { user },
                error,
              } = await client.auth.getUser(token)

              if (error || !user?.email) {
                return Response.json({ error: 'Unauthorized' }, { status: 401 })
              }

              requesterEmail = user.email.toLowerCase()
              accessToken = token
            } else {
              requesterEmail = 'root-superadmin@localhost'
            }
          }

          const form = await request.formData()
          const file = form.get('file') as File | null
          if (!file) {
            return Response.json({ error: 'No file uploaded' }, { status: 400 })
          }

          const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
          const isImage = ALLOWED_IMAGES.has(ext)
          const isVideo = ALLOWED_VIDEOS.has(ext)
          if (!isImage && !isVideo) {
            return Response.json({ error: 'Invalid file type' }, { status: 400 })
          }

          const bucket = 'blog-media'
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
          const filePath = `${requesterEmail}/${Date.now()}-${safeName}`

          const supabase = hasSupabaseAdminConfig()
            ? getSupabaseAdminClient()
            : getSupabaseServerClientForToken(accessToken || undefined)

          const { error } = await supabase.storage.from(bucket).upload(filePath, file, {
            contentType: file.type,
            upsert: false,
          })
          if (error) {
            return Response.json({ error: error.message }, { status: 500 })
          }

          const publicUrl = supabase.storage.from(bucket).getPublicUrl(filePath).data.publicUrl
          return Response.json({ url: publicUrl, kind: isImage ? 'image' : 'video' }, { status: 201 })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json(
            { error: error instanceof Error ? error.message : 'Unexpected server error' },
            { status: 500 },
          )
        }
      },
    },
  },
})
