import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '../../../lib/orgAuth'
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../../lib/supabaseAdmin'

const BUCKET = 'blog-media'
const RELEASES_DIR = 'app-releases/android'
const LATEST_METADATA_PATH = `${RELEASES_DIR}/latest.json`
const ALLOWED_TYPES = new Set([
  'application/vnd.android.package-archive',
  'application/octet-stream',
])

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export const Route = createFileRoute('/api/admin/apk-release')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requirePermission(request, 'access_admin_dashboard')

          if (!hasSupabaseAdminConfig()) {
            return Response.json({ error: 'APK release management requires SUPABASE_SERVICE_ROLE_KEY.' }, { status: 503 })
          }

          const admin = getSupabaseAdminClient()
          const { data, error } = await admin.storage.from(BUCKET).download(LATEST_METADATA_PATH)
          if (error || !data) {
            return Response.json({ release: null })
          }

          const metadata = await data.text()
          return new Response(metadata, {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json(
            { error: error instanceof Error ? error.message : 'Unexpected server error' },
            { status: 500 },
          )
        }
      },

      POST: async ({ request }) => {
        try {
          const access = await requirePermission(request, 'access_admin_dashboard')

          if (!hasSupabaseAdminConfig()) {
            return Response.json({ error: 'APK release management requires SUPABASE_SERVICE_ROLE_KEY.' }, { status: 503 })
          }

          const form = await request.formData()
          const file = form.get('file')
          const version = String(form.get('version') || '').trim()
          const notes = String(form.get('notes') || '').trim()

          if (!(file instanceof File)) {
            return Response.json({ error: 'APK file is required.' }, { status: 400 })
          }

          if (!version) {
            return Response.json({ error: 'Version is required.' }, { status: 400 })
          }

          if (!file.name.toLowerCase().endsWith('.apk')) {
            return Response.json({ error: 'Only .apk files are supported.' }, { status: 400 })
          }

          if (file.type && !ALLOWED_TYPES.has(file.type)) {
            return Response.json({ error: 'Unsupported APK MIME type.' }, { status: 400 })
          }

          const admin = getSupabaseAdminClient()
          const safeName = sanitizeFilename(file.name)
          const releasePath = `${RELEASES_DIR}/${Date.now()}-${safeName}`

          const { error: uploadError } = await admin.storage.from(BUCKET).upload(releasePath, file, {
            contentType: file.type || 'application/vnd.android.package-archive',
            upsert: false,
          })

          if (uploadError) {
            return Response.json({ error: uploadError.message }, { status: 500 })
          }

          const publicUrl = admin.storage.from(BUCKET).getPublicUrl(releasePath).data.publicUrl

          const release = {
            version,
            notes,
            uploadedAt: new Date().toISOString(),
            uploadedBy: access.requester.email,
            fileName: file.name,
            fileSizeBytes: file.size,
            url: publicUrl,
          }

          const metadataBlob = new Blob([JSON.stringify(release, null, 2)], { type: 'application/json' })
          const { error: metadataError } = await admin.storage.from(BUCKET).upload(LATEST_METADATA_PATH, metadataBlob, {
            contentType: 'application/json',
            upsert: true,
          })

          if (metadataError) {
            return Response.json({ error: metadataError.message }, { status: 500 })
          }

          return Response.json({ release }, { status: 201 })
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
