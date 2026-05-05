import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { getRequesterAccess, isLocalRequest, requirePermission } from '../../lib/orgAuth'
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../lib/supabaseAdmin'
import { getSupabaseServerPublicClient } from '../../lib/supabaseServer'

const WRITE_ROLES = new Set(['superadmin', 'admin', 'manager', 'staff', 'helper', 'user'])

const NewsPostSchema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(1).max(20000),
  image_urls: z.array(z.string().url()).max(10).default([]),
  video_urls: z.array(z.string().url()).max(10).default([]),
  embed_links: z.array(z.string().url()).max(20).default([]),
})

function isMissingBlogTableError(error: { code?: string; message?: string } | null | undefined) {
  const code = String(error?.code || '').toUpperCase()
  const message = String(error?.message || '').toLowerCase()
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('org_blog_posts') ||
    message.includes('schema cache')
  )
}

export const Route = createFileRoute('/api/news')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const client = getSupabaseServerPublicClient()
          const { data, error } = await client
            .from('org_blog_posts')
            .select('id, title, body, author_email, image_urls, video_urls, embed_links, created_at, updated_at')
            .eq('is_published', true)
            .order('created_at', { ascending: false })

          if (error) {
            // Missing table in some environments should degrade gracefully.
            if (isMissingBlogTableError(error)) {
              return Response.json([])
            }
            return Response.json({ error: error.message }, { status: 500 })
          }

          const posts = (data || []).map((row) => ({
            id: row.id,
            title: row.title,
            body: row.body,
            author: row.author_email,
            image_urls: row.image_urls || [],
            video_urls: row.video_urls || [],
            embed_links: row.embed_links || [],
            created_at: row.created_at,
            updated_at: row.updated_at,
          }))

          return Response.json(posts)
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
          let authorEmail = ''
          let canContribute = false

          if (hasSupabaseAdminConfig()) {
            const access = await getRequesterAccess(request)
            canContribute = WRITE_ROLES.has(access.role) && access.role !== 'banned'
            authorEmail = access.requester.email
          } else {
            const useLocalRoot = request.headers.get('x-local-root-session') === 'true' && isLocalRequest(request)
            if (!useLocalRoot) {
              return Response.json(
                { error: 'Blog contributions require SUPABASE_SERVICE_ROLE_KEY in this environment.' },
                { status: 503 },
              )
            }

            await requirePermission(request, 'view_creator_tools')
            authorEmail = 'root-superadmin@localhost'
            canContribute = true
          }

          if (!canContribute) {
            return Response.json({ error: 'Insufficient permissions' }, { status: 403 })
          }

          const payload = NewsPostSchema.safeParse(await request.json())
          if (!payload.success) {
            return Response.json({ error: payload.error.flatten() }, { status: 400 })
          }

          const normalized = {
            title: payload.data.title.trim(),
            body: payload.data.body.trim(),
            image_urls: payload.data.image_urls,
            video_urls: payload.data.video_urls,
            embed_links: payload.data.embed_links,
          }

          const db = hasSupabaseAdminConfig()
            ? getSupabaseAdminClient()
            : getSupabaseServerPublicClient()

          const { data, error } = await db
            .from('org_blog_posts')
            .insert([
              {
                ...normalized,
                author_email: authorEmail,
              },
            ])
            .select('id, title, body, author_email, image_urls, video_urls, embed_links, created_at, updated_at')

          if (error) {
            if (isMissingBlogTableError(error)) {
              return Response.json(
                { error: 'Blog storage table is not set up yet. Please run the blog schema migration first.' },
                { status: 503 },
              )
            }
            return Response.json({ error: error.message }, { status: 500 })
          }

          return Response.json((data || [])[0], { status: 201 })
        } catch (error) {
          if (error instanceof Response) return error

          return Response.json(
            { error: error instanceof Error ? error.message : 'Unexpected server error' },
            { status: 500 },
          )
        }
      },
      HEAD: async () => {
        return new Response(null, { status: 200 })
      },
      OPTIONS: async () => {
        return new Response(null, {
          status: 204,
          headers: {
            Allow: 'GET, POST, HEAD, OPTIONS',
          },
        })
      },
    },
  },
})
