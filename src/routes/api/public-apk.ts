import { createFileRoute } from '@tanstack/react-router'
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../lib/supabaseAdmin'

const BUCKET = 'blog-media'
const LATEST_METADATA_PATH = 'app-releases/android/latest.json'

export const Route = createFileRoute('/api/public-apk')({
  server: {
    handlers: {
      GET: async () => {
        try {
          if (!hasSupabaseAdminConfig()) {
            return Response.json({ release: null })
          }

          const admin = getSupabaseAdminClient()
          const { data, error } = await admin.storage.from(BUCKET).download(LATEST_METADATA_PATH)

          if (error || !data) {
            return Response.json({ release: null })
          }

          const raw = await data.text()
          const release = JSON.parse(raw) as {
            version: string
            notes?: string
            uploadedAt: string
            fileName: string
            fileSizeBytes: number
            url: string
          }

          return Response.json({ release })
        } catch {
          return Response.json({ release: null })
        }
      },
    },
  },
})
