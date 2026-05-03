import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { getLivestreamSnapshot, parseLivestreamLink } from '../../../lib/liveStatus'
import { isLocalRequest } from '../../../lib/orgAuth'
import { requirePermission } from '../../../lib/orgAuth'
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../../lib/supabaseAdmin'
import { getSupabaseServerPublicClient } from '../../../lib/supabaseServer'

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
          const useAdminPath = hasSupabaseAdminConfig()
          const useLocalRoot = request.headers.get('x-local-root-session') === 'true' && isLocalRequest(request)

          let streams: DbStream[] = []
          let requesterEmail = 'unknown'
          let requesterSource = 'supabase-session'
          let canManage = false
          let canUseAutoclipper = false

          if (useAdminPath) {
            const access = await requirePermission(request, 'view_live_streams')
            const admin = getSupabaseAdminClient()

            const { data, error } = await admin.rpc('list_org_livestreams')
            if (error) {
              return Response.json({ error: error.message }, { status: 500 })
            }

            streams = (data || []) as DbStream[]
            requesterEmail = access.requester.email
            requesterSource = access.requester.source
            canManage = access.isSuperadmin || access.permissions.includes('manage_livestreams')
            canUseAutoclipper = access.isSuperadmin || access.permissions.includes('use_autoclipper')
          } else {
            const client = getSupabaseServerPublicClient()

            if (useLocalRoot) {
              requesterEmail = 'root-superadmin@localhost'
              requesterSource = 'localhost-bypass'
              canManage = false
              canUseAutoclipper = false
            } else {
              const authHeader = request.headers.get('authorization') || ''
              const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
              if (!token) {
                return Response.json(
                  { error: 'Authentication required to view livestreams right now.' },
                  { status: 401 },
                )
              }

              const {
                data: { user },
                error: userError,
              } = await client.auth.getUser(token)

              if (userError || !user?.email) {
                return Response.json(
                  { error: 'Authentication required to view livestreams right now.' },
                  { status: 401 },
                )
              }

              requesterEmail = user.email
              requesterSource = 'supabase-session'
            }

            const { data, error } = await client
              .from('org_livestreams')
              .select('id, url, title, platform, stream_key, created_by, created_at, updated_at')
              .order('updated_at', { ascending: false })

            if (error) {
              return Response.json({ error: error.message }, { status: 500 })
            }

            streams = (data || []) as DbStream[]
          }

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
              email: requesterEmail,
              source: requesterSource,
            },
            canManage,
            canUseAutoclipper,
            streams: sortedStreams,
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
          return Response.json(
            { error: error instanceof Error ? error.message : 'Unexpected server error' },
            { status: 500 },
          )
        }
      },
    },
  },
})
