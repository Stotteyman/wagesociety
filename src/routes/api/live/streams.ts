import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { getLivestreamSnapshot, parseLivestreamLink } from '../../../lib/liveStatus'
import { requirePermission } from '../../../lib/orgAuth'
import { getSupabaseAdminClient } from '../../../lib/supabaseAdmin'

const addStreamSchema = z.object({
  url: z.string().url(),
  title: z.string().max(120).optional(),
})

const removeStreamSchema = z.object({
  id: z.string().uuid(),
})

type DbStream = {
  id: string
  url: string
  title: string | null
  platform: 'twitch' | 'youtube' | 'kick'
  stream_key: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export const Route = createFileRoute('/api/live/streams')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const access = await requirePermission(request, 'view_live_streams')
          const admin = getSupabaseAdminClient()

          const { data, error } = await admin.rpc('list_org_livestreams')
          if (error) {
            return Response.json({ error: error.message }, { status: 500 })
          }

          const streams = (data || []) as DbStream[]

          const withStatus = await Promise.all(
            streams.map(async (stream) => {
              const snapshot = await getLivestreamSnapshot(stream.platform, stream.stream_key)
              return {
                ...stream,
                status: snapshot.status,
                viewer_count: snapshot.viewerCount,
                follower_count: snapshot.followerCount,
                account_created_at: snapshot.accountCreatedAt,
              }
            })
          )

          const sortedStreams = [...withStatus].sort((a, b) => {
            const aLive = a.status === 'live' ? 1 : 0
            const bLive = b.status === 'live' ? 1 : 0
            if (aLive !== bLive) return bLive - aLive

            const aViewers = a.viewer_count || 0
            const bViewers = b.viewer_count || 0
            if (aViewers !== bViewers) return bViewers - aViewers

            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          })

          return Response.json({
            requester: {
              ...access.requester,
              role: access.role,
            },
            canManage: access.isSuperadmin || access.permissions.includes('manage_livestreams'),
            streams: sortedStreams,
          })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },
      POST: async ({ request }) => {
        try {
          const { requester } = await requirePermission(request, 'manage_livestreams')
          const admin = getSupabaseAdminClient()
          const body = await request.json()
          const parsed = addStreamSchema.safeParse(body)

          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          const stream = parseLivestreamLink(parsed.data.url)

          const { data, error } = await admin.rpc('add_org_livestream', {
            p_url: parsed.data.url,
            p_title: parsed.data.title || null,
            p_platform: stream.platform,
            p_stream_key: stream.streamKey,
            p_created_by: requester.email,
          })

          if (error) {
            return Response.json({ error: error.message }, { status: 500 })
          }

          return Response.json({ stream: data?.[0] || null })
        } catch (error) {
          if (error instanceof Response) return error

          if (error instanceof Error) {
            return Response.json({ error: error.message }, { status: 400 })
          }

          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },
      DELETE: async ({ request }) => {
        try {
          await requirePermission(request, 'manage_livestreams')
          const admin = getSupabaseAdminClient()
          const body = await request.json()
          const parsed = removeStreamSchema.safeParse(body)

          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          const { data, error } = await admin.rpc('delete_org_livestream', {
            p_id: parsed.data.id,
          })

          if (error) {
            return Response.json({ error: error.message }, { status: 500 })
          }

          return Response.json({ deleted: !!data })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },
    },
  },
})
