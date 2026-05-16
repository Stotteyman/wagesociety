import { createFileRoute } from '@tanstack/react-router'
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../../lib/supabaseAdmin'
import { getSupabaseServerClientForToken } from '../../../lib/supabaseServer'
import { requirePermission } from '../../../lib/orgAuth'

const BUCKET = 'merch-studio-media'
const ALLOWED_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'mp4',
  'webm',
  'mov',
  'm4v',
  'obj',
  'fbx',
  'glb',
  'gltf',
  'stl',
])
const MAX_SIZE = 120 * 1024 * 1024

function getExtension(filename: string) {
  const name = filename.toLowerCase()
  const parts = name.split('.')
  return parts.length > 1 ? parts.pop() || '' : ''
}

export const Route = createFileRoute('/api/merch-studio/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const access = await requirePermission(request, 'view_merch')
          if (access.role === 'banned') {
            return Response.json({ error: 'Banned users cannot upload merch studio media.' }, { status: 403 })
          }
          const requesterEmail = access.requester.email

          const form = await request.formData()
          const file = form.get('file')
          if (!(file instanceof File)) {
            return Response.json({ error: 'File is required.' }, { status: 400 })
          }

          if (file.size <= 0) {
            return Response.json({ error: 'File is empty.' }, { status: 400 })
          }

          if (file.size > MAX_SIZE) {
            return Response.json(
              { error: `File is too large. Maximum size is ${Math.floor(MAX_SIZE / (1024 * 1024))} MB.` },
              { status: 413 },
            )
          }

          const ext = getExtension(file.name)
          if (!ALLOWED_EXTENSIONS.has(ext)) {
            return Response.json({ error: 'Unsupported file type.' }, { status: 400 })
          }

          const safeEmail = (requesterEmail || 'member').replace(/[^a-z0-9._-]+/gi, '_')
          const stamp = Date.now()
          const random = Math.random().toString(36).slice(2, 10)
          const path = `${safeEmail}/${stamp}-${random}.${ext}`

          const contentType = file.type || 'application/octet-stream'
          const buffer = await file.arrayBuffer()

          if (hasSupabaseAdminConfig()) {
            const admin = getSupabaseAdminClient()
            const { error: uploadError } = await admin.storage
              .from(BUCKET)
              .upload(path, buffer, { contentType, upsert: false })

            if (uploadError) {
              return Response.json({ error: uploadError.message }, { status: 500 })
            }

            const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
            return Response.json({ url: pub.publicUrl, path }, { status: 201 })
          }

          const authHeader = request.headers.get('authorization')
          const token = authHeader?.toLowerCase().startsWith('bearer ')
            ? authHeader.slice(7).trim()
            : undefined

          if (!token) {
            return Response.json(
              { error: 'Missing bearer token for upload in fallback mode.' },
              { status: 401 },
            )
          }

          const scopedClient = getSupabaseServerClientForToken(token)
          const { error: uploadError } = await scopedClient.storage
            .from(BUCKET)
            .upload(path, buffer, { contentType, upsert: false })

          if (uploadError) {
            return Response.json({ error: uploadError.message }, { status: 500 })
          }

          const { data: pub } = scopedClient.storage.from(BUCKET).getPublicUrl(path)
          return Response.json({ url: pub.publicUrl, path }, { status: 201 })
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
