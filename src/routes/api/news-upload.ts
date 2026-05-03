import { createFileRoute } from '@tanstack/react-router'
import { getRequesterAccess } from '../../lib/orgAuth'
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin'

const WRITE_ROLES = new Set(['superadmin', 'admin', 'manager', 'staff'])
const ALLOWED_IMAGES = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])
const ALLOWED_VIDEOS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv'])

export const Route = createFileRoute('/api/news-upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const access = await getRequesterAccess(request)
          if (!WRITE_ROLES.has(access.role)) {
            return Response.json({ error: 'Insufficient permissions' }, { status: 403 })
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

          const supabase = getSupabaseAdminClient()
          const bucket = isImage ? 'news-images' : 'news-videos'
          const filePath = `${Date.now()}-${file.name}`
          const { error } = await supabase.storage.from(bucket).upload(filePath, file.stream(), {
            contentType: file.type,
            upsert: false,
          })
          if (error) {
            return Response.json({ error: error.message }, { status: 500 })
          }
          const publicUrl = supabase.storage.from(bucket).getPublicUrl(filePath).publicUrl
          return Response.json({ url: publicUrl }, { status: 201 })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },
    },
  },
})
