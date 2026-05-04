import { createFileRoute } from '@tanstack/react-router'
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../lib/supabaseAdmin'
import { getSupabaseServerClientForToken } from '../../lib/supabaseServer'
import { isLocalRequest, requirePermission } from '../../lib/orgAuth'

const BUCKET = 'blog-media'
const FOLDER = 'profile-avatars'
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif'])
const MAX_SIZE = 8 * 1024 * 1024

function getExtension(filename: string) {
  const parts = filename.toLowerCase().split('.')
  return parts.length > 1 ? parts.pop() || '' : ''
}

function getAuthToken(request: Request) {
  const authHeader = request.headers.get('authorization') || ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) return undefined
  const token = authHeader.slice(7).trim()
  return token || undefined
}

export const Route = createFileRoute('/api/profile-photo-upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const isLocalRoot = request.headers.get('x-local-root-session') === 'true' && isLocalRequest(request)

          let requesterEmail = 'member'
          if (!isLocalRoot) {
            const access = await requirePermission(request, 'view_dashboard')
            if (access.role === 'banned') {
              return Response.json({ error: 'Banned users cannot upload profile photos.' }, { status: 403 })
            }
            requesterEmail = access.requester.email
          } else {
            requesterEmail = 'root-superadmin@localhost'
          }

          const form = await request.formData()
          const file = form.get('file')
          if (!(file instanceof File)) {
            return Response.json({ error: 'Image file is required.' }, { status: 400 })
          }

          if (file.size <= 0) {
            return Response.json({ error: 'File is empty.' }, { status: 400 })
          }

          if (file.size > MAX_SIZE) {
            return Response.json(
              { error: `Image is too large. Maximum size is ${Math.floor(MAX_SIZE / (1024 * 1024))} MB.` },
              { status: 413 },
            )
          }

          const ext = getExtension(file.name)
          const hasValidMime = ALLOWED_MIME_TYPES.has(file.type)
          const hasValidExt = ALLOWED_EXTENSIONS.has(ext)

          if (!hasValidMime && !hasValidExt) {
            return Response.json({ error: 'Unsupported image type. Use JPG, PNG, WEBP, or GIF.' }, { status: 400 })
          }

          const safeEmail = requesterEmail.replace(/[^a-z0-9._-]+/gi, '_')
          const stamp = Date.now()
          const random = Math.random().toString(36).slice(2, 10)
          const extension = hasValidExt ? ext : 'jpg'
          const path = `${FOLDER}/${safeEmail}/${stamp}-${random}.${extension}`

          const contentType = file.type || 'application/octet-stream'
          const data = await file.arrayBuffer()

          if (hasSupabaseAdminConfig()) {
            const admin = getSupabaseAdminClient()
            const { error: uploadError } = await admin.storage
              .from(BUCKET)
              .upload(path, data, { contentType, upsert: false })

            if (uploadError) {
              return Response.json({ error: uploadError.message }, { status: 500 })
            }

            const { data: publicData } = admin.storage.from(BUCKET).getPublicUrl(path)
            return Response.json({ url: publicData.publicUrl, path }, { status: 201 })
          }

          const token = getAuthToken(request)
          if (!token) {
            return Response.json(
              { error: 'Missing bearer token for upload in fallback mode.' },
              { status: 401 },
            )
          }

          const scopedClient = getSupabaseServerClientForToken(token)
          const { error: uploadError } = await scopedClient.storage
            .from(BUCKET)
            .upload(path, data, { contentType, upsert: false })

          if (uploadError) {
            return Response.json({ error: uploadError.message }, { status: 500 })
          }

          const { data: publicData } = scopedClient.storage.from(BUCKET).getPublicUrl(path)
          return Response.json({ url: publicData.publicUrl, path }, { status: 201 })
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
