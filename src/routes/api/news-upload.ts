import { getSupabaseAdminClient } from '../../lib/supabaseAdmin'
import { getUserRoleFromRequest } from '../../lib/orgAuth'

export const config = {
  runtime: 'edge',
}

export default async function handler(req: Request) {
  // Only staff/admin/manager/superadmin can upload
  const role = await getUserRoleFromRequest(req)
  if (!['superadmin', 'admin', 'manager', 'staff'].includes(role)) {
    return new Response(JSON.stringify({ error: 'Insufficient permissions' }), { status: 403 })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) {
    return new Response(JSON.stringify({ error: 'No file uploaded' }), { status: 400 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
  const isVideo = ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)
  if (!isImage && !isVideo) {
    return new Response(JSON.stringify({ error: 'Invalid file type' }), { status: 400 })
  }

  const supabase = getSupabaseAdminClient()
  const bucket = isImage ? 'news-images' : 'news-videos'
  const filePath = `${Date.now()}-${file.name}`
  const { data, error } = await supabase.storage.from(bucket).upload(filePath, file.stream(), {
    contentType: file.type,
    upsert: false,
  })
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
  const publicUrl = supabase.storage.from(bucket).getPublicUrl(filePath).publicUrl
  return new Response(JSON.stringify({ url: publicUrl }), { status: 201 })
}
