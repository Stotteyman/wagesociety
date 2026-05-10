import { createFileRoute } from '@tanstack/react-router'
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../lib/supabaseAdmin'
import fs from 'node:fs/promises'
import path from 'node:path'

const BUCKET = 'blog-media'
const LATEST_METADATA_PATH = 'app-releases/android/latest.json'
const LOCAL_PUBLIC_METADATA_PATH = path.join(process.cwd(), 'public', LATEST_METADATA_PATH)
const LOCAL_PUBLIC_APK_PATH = path.join(process.cwd(), 'public', 'wagesociety.apk')

export const Route = createFileRoute('/api/public-apk')({
  server: {
    handlers: {
      GET: async () => {
        try {
          if (!hasSupabaseAdminConfig()) {
            try {
              const raw = await fs.readFile(LOCAL_PUBLIC_METADATA_PATH, 'utf8')
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
              try {
                const stat = await fs.stat(LOCAL_PUBLIC_APK_PATH)
                return Response.json({
                  release: {
                    version: 'local',
                    uploadedAt: stat.mtime.toISOString(),
                    fileName: 'wagesociety.apk',
                    fileSizeBytes: stat.size,
                    url: '/wagesociety.apk',
                  },
                })
              } catch {
                return Response.json({ release: null })
              }
            }
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
