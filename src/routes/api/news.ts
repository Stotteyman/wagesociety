import { getSupabaseAdminClient } from '../../lib/supabaseAdmin'
import { z } from 'zod'
import { getUserRoleFromRequest } from '../../lib/orgAuth'

const NewsPostSchema = z.object({
  title: z.string().min(3),
  body: z.string().min(1),
  image_url: z.string().url().optional(),
  video_url: z.string().url().optional(),
})

export default async function handler(req: Request) {
  const admin = getSupabaseAdminClient()
  if (req.method === 'GET') {
    const { data, error } = await admin.from('news').select('*').order('created_at', { ascending: false })
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    return new Response(JSON.stringify(data), { status: 200 })
  }
  if (req.method === 'POST') {
    // Permission check
    const role = await getUserRoleFromRequest(req)
    if (!['superadmin', 'admin', 'manager', 'staff'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), { status: 403 })
    }
    const form = await req.formData()
    const title = form.get('title')?.toString() || ''
    const body = form.get('body')?.toString() || ''
    const image_url = form.get('image_url')?.toString() || undefined
    const video_url = form.get('video_url')?.toString() || undefined
    const parse = NewsPostSchema.safeParse({ title, body, image_url, video_url })
    if (!parse.success) {
      return new Response(JSON.stringify({ error: parse.error.errors }), { status: 400 })
    }
    // Insert post
    const { data, error } = await admin.from('news').insert([{ title, body, image_url, video_url }]).select()
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    return new Response(JSON.stringify(data[0]), { status: 201 })
  }
  return new Response('Method Not Allowed', { status: 405 })
}
