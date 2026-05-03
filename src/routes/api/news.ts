import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { getRequesterAccess, requirePermission } from '../../lib/orgAuth'
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin'

const WRITE_ROLES = new Set(['superadmin', 'admin', 'manager', 'staff'])

const NewsPostSchema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(1).max(20000),
  image_url: z.string().url().optional(),
  video_url: z.string().url().optional(),
})

export const Route = createFileRoute('/api/news')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requirePermission(request, 'view_creator_tools')
          const admin = getSupabaseAdminClient()
          const { data, error } = await admin.from('news').select('*').order('created_at', { ascending: false })
          if (error) return Response.json({ error: error.message }, { status: 500 })
          return Response.json(data)
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },
      POST: async ({ request }) => {
        try {
          const access = await getRequesterAccess(request)
          if (!WRITE_ROLES.has(access.role)) {
            return Response.json({ error: 'Insufficient permissions' }, { status: 403 })
          }
          const form = await request.formData()
          const title = form.get('title')?.toString() || ''
          const body = form.get('body')?.toString() || ''
          const image_url = form.get('image_url')?.toString() || undefined
          const video_url = form.get('video_url')?.toString() || undefined
          const parse = NewsPostSchema.safeParse({ title, body, image_url, video_url })
          if (!parse.success) {
            return Response.json({ error: parse.error.flatten() }, { status: 400 })
          }
          const admin = getSupabaseAdminClient()
          const { data, error } = await admin
            .from('news')
            .insert([{ title, body, image_url: image_url ?? null, video_url: video_url ?? null }])
            .select()
          if (error) return Response.json({ error: error.message }, { status: 500 })
          return Response.json((data as unknown[])[0], { status: 201 })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },
    },
  },
})
