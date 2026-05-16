import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { getLivestreamSnapshot, parseLivestreamLink } from '../../../lib/liveStatus'
import { listAuthIndexedUsers } from '../../../lib/authUserIndex'
import { getRequesterAccess, requirePermission } from '../../../lib/orgAuth'
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

type ProfileRow = {
  email: string
  display_name: string | null
  bio: string | null
  updated_at: string | null
}

type AuthUserRow = {
  id: string
  email: string | null
  created_at: string | null
  updated_at: string | null
  user_metadata?: Record<string, unknown> | null
}

type AutoCandidate = {
  url: string
  platform: 'twitch' | 'youtube' | 'kick'
  stream_key: string
}

const URL_REGEX = /https?:\/\/[^\s)]+/gi

function normalizeUrl(value: string) {
  return value.trim().replace(/[),.;]+$/g, '')
}

function normalizeStreamKey(platform: string, streamKey: string): string {
  // Normalize YouTube handles to always exclude @ for consistent deduplication
  if (platform === 'youtube' && streamKey.startsWith('handle:')) {
    const handle = streamKey.slice('handle:'.length).replace(/^@/, '')
    return `${platform}:handle:${handle}`
  }
  return `${platform}:${streamKey}`
}

function collectStringValues(input: unknown, depth = 0): string[] {
  if (depth > 3 || input == null) return []

  if (typeof input === 'string') {
    const trimmed = input.trim()
    return trimmed ? [trimmed] : []
  }

  if (Array.isArray(input)) {
    return input.flatMap((item) => collectStringValues(item, depth + 1))
  }

  if (typeof input === 'object') {
    return Object.values(input as Record<string, unknown>).flatMap((value) => collectStringValues(value, depth + 1))
  }

  return []
}

function extractUrls(input: unknown) {
  const values = collectStringValues(input)
  const urls: string[] = []

  for (const value of values) {
    const matches = value.match(URL_REGEX)
    if (!matches) continue

    for (const match of matches) {
      const normalized = normalizeUrl(match)
      if (normalized) urls.push(normalized)
    }
  }

  return urls
}

function toKickUrl(value: unknown) {
  const username = String(value || '').trim().replace(/^@/, '')
  if (!username) return null
  return `https://kick.com/${username}`
}

function toTwitchUrl(value: unknown) {
  const username = String(value || '').trim().replace(/^@/, '')
  if (!username) return null
  return `https://www.twitch.tv/${username}`
}

function toYouTubeHandleUrl(value: unknown) {
  const username = String(value || '').trim().replace(/^@/, '')
  if (!username) return null
  return `https://www.youtube.com/@${username}`
}

function collectCandidateUrls(meta: Record<string, unknown> | null | undefined, profile: ProfileRow | undefined) {
  const urls = new Set<string>()

  const kickFromUsername = toKickUrl(meta?.kick_username)
  if (kickFromUsername) urls.add(kickFromUsername)

  const twitchFromUsername = toTwitchUrl(meta?.twitch_username)
  if (twitchFromUsername) urls.add(twitchFromUsername)

  const selectedYouTubeChannel = String(meta?.selected_youtube_channel || '').trim()
  if (selectedYouTubeChannel) {
    if (selectedYouTubeChannel.startsWith('handle:')) {
      urls.add(`https://www.youtube.com/@${selectedYouTubeChannel.slice('handle:'.length)}`)
    } else if (selectedYouTubeChannel.startsWith('channel:')) {
      urls.add(`https://www.youtube.com/channel/${selectedYouTubeChannel.slice('channel:'.length)}`)
    } else if (selectedYouTubeChannel.startsWith('user:')) {
      urls.add(`https://www.youtube.com/user/${selectedYouTubeChannel.slice('user:'.length)}`)
    } else if (selectedYouTubeChannel.startsWith('custom:')) {
      urls.add(`https://www.youtube.com/c/${selectedYouTubeChannel.slice('custom:'.length)}`)
    } else {
      for (const url of extractUrls(selectedYouTubeChannel)) {
        urls.add(url)
      }
    }
  }

  const youtubeFromHandle = toYouTubeHandleUrl(meta?.youtube_handle)
  if (youtubeFromHandle) urls.add(youtubeFromHandle)

  return Array.from(urls)
}

function parseAutoCandidates(urls: string[]): AutoCandidate[] {
  const dedupe = new Set<string>()
  const candidates: AutoCandidate[] = []

  for (const url of urls) {
    try {
      const parsed = parseLivestreamLink(url)
      const key = `${parsed.platform}:${parsed.streamKey}`
      if (dedupe.has(key)) continue
      dedupe.add(key)

      candidates.push({
        url,
        platform: parsed.platform,
        stream_key: parsed.streamKey,
      })
    } catch {
      // Ignore non-supported or malformed links in profile metadata.
    }
  }

  return candidates
}

function pickMostEngaged(candidates: Array<DbStream & {
  status: 'live' | 'offline'
  viewer_count: number | null
  follower_count: number | null
  account_created_at: string | null
}>) {
  return [...candidates].sort((a, b) => {
    const aViewers = a.viewer_count || 0
    const bViewers = b.viewer_count || 0
    if (aViewers !== bViewers) return bViewers - aViewers

    const aLive = a.status === 'live' ? 1 : 0
    const bLive = b.status === 'live' ? 1 : 0
    if (aLive !== bLive) return bLive - aLive

    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })[0] || null
}

export const Route = createFileRoute('/api/live/streams')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          // Streams list is publicly visible — no auth required.
          // Auth is only used to determine canManage / canUseAutoclipper flags.
          const client = hasSupabaseAdminConfig() ? getSupabaseAdminClient() : getSupabaseServerPublicClient()

          // First, fetch livestreams from the database (more reliable)
          const { data: dbLivestreams, error: liveError } = await (client as any)
            .from('org_member_livestreams')
            .select('*')
            .limit(10000)

          const autoStreams: DbStream[] = []

          // Process database livestreams - group by email to handle multi-platform users
          // For each user with multiple streams, pick the most recently updated one (their preference)
          const dbStreamsByEmail = new Map<string, typeof dbLivestreams[number][]>()
          if (!liveError && Array.isArray(dbLivestreams)) {
            for (const livestream of dbLivestreams) {
              const email = String(livestream.email || '').trim().toLowerCase()
              if (!email) continue
              if (!dbStreamsByEmail.has(email)) {
                dbStreamsByEmail.set(email, [])
              }
              dbStreamsByEmail.get(email)!.push(livestream)
            }
          }

          // For each email, pick the preferred stream (most recently updated)
          for (const [, streams] of dbStreamsByEmail) {
            const preferred = streams.sort((a, b) => {
              const aTime = new Date(a.updated_at).getTime()
              const bTime = new Date(b.updated_at).getTime()
              return bTime - aTime // Most recent first
            })[0]

            if (!preferred) continue

            try {
              const snapshot = await getLivestreamSnapshot(preferred.platform, preferred.stream_key)

              autoStreams.push({
                id: `db-${preferred.id}`,
                url: preferred.stream_url,
                title: preferred.display_name || preferred.email.split('@')[0] || null,
                platform: preferred.platform,
                stream_key: preferred.stream_key,
                created_by: preferred.email,
                created_at: preferred.created_at,
                updated_at: preferred.updated_at,
                status: snapshot.status,
                viewer_count: snapshot.viewerCount,
                follower_count: snapshot.followerCount,
                account_created_at: snapshot.accountCreatedAt,
              })
            } catch (err) {
              console.error('Failed to fetch livestream snapshot:', err)
              // Skip failed livestreams, continue with others
            }
          }

          // Fallback: Also fetch from user_metadata for backwards compatibility
          const users = await listAuthIndexedUsers(client)

          const { data: profileRows } = await client
            .from('org_member_profiles')
            .select('email, display_name, bio, updated_at')
            .limit(10000)

          const profileByEmail = new Map(
            ((profileRows || []) as ProfileRow[]).map((row) => [String(row.email || '').trim().toLowerCase(), row])
          )

          // Build normalized dedup set from existing streams (database ones)
          const existingStreamKeys = new Set(
            autoStreams.map((stream) => normalizeStreamKey(stream.platform, stream.stream_key))
          )

          // Also track existing user emails from database
          const existingEmails = new Set(
            autoStreams.map((stream) => String(stream.created_by || '').trim().toLowerCase())
          )

          for (const row of users as AuthUserRow[]) {
            const email = String(row.email || '').trim().toLowerCase()
            if (!row.id || !email) continue

            // Skip users who already have a database stream
            if (existingEmails.has(email)) continue

            const profile = profileByEmail.get(email)
            const candidates = parseAutoCandidates(
              collectCandidateUrls((row.user_metadata as Record<string, unknown> | null | undefined) ?? null, profile)
            ).filter((candidate) => !existingStreamKeys.has(normalizeStreamKey(candidate.platform, candidate.stream_key)))

            if (candidates.length === 0) continue

            const streamCandidates = await Promise.all(
              candidates.map(async (candidate) => {
                const snapshot = await getLivestreamSnapshot(candidate.platform, candidate.stream_key)

                return {
                  id: `auto-${row.id}-${candidate.platform}-${candidate.stream_key}`,
                  url: candidate.url,
                  title: profile?.display_name?.trim() || email.split('@')[0] || null,
                  platform: candidate.platform,
                  stream_key: candidate.stream_key,
                  created_by: email,
                  created_at: row.created_at || new Date().toISOString(),
                  updated_at: profile?.updated_at || row.updated_at || row.created_at || new Date().toISOString(),
                  status: snapshot.status,
                  viewer_count: snapshot.viewerCount,
                  follower_count: snapshot.followerCount,
                  account_created_at: snapshot.accountCreatedAt,
                }
              })
            )

            const best = pickMostEngaged(streamCandidates)
            if (best) {
              autoStreams.push(best)
              existingStreamKeys.add(normalizeStreamKey(best.platform, best.stream_key))
            }
          }

          // Best-effort: resolve requester to compute permission flags.
          let requesterEmail = 'anonymous'
          let requesterSource = 'none'
          let canManage = false
          let canUseAutoclipper = false
          const autoclipperEnabled = hasSupabaseAdminConfig()

          const authHeader = request.headers.get('authorization') || ''
          const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

          if (token) {
            try {
              const access = await getRequesterAccess(request)
              requesterEmail = access.requester.email
              requesterSource = access.requester.source
              canManage = access.isSuperadmin || access.permissions.includes('manage_livestreams')
              canUseAutoclipper =
                autoclipperEnabled && (access.isSuperadmin || access.permissions.includes('use_autoclipper'))
            } catch {
              // Expired/invalid token — still show public stream list.
            }
          }

          const sortedStreams = [...autoStreams].sort((a, b) => {
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
          const body = await request.json()
          const parsed = addStreamSchema.safeParse(body)

          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          const stream = parseLivestreamLink(parsed.data.url)

          if (!hasSupabaseAdminConfig()) {
            return Response.json(
              { error: 'Admin livestream management requires SUPABASE_SERVICE_ROLE_KEY in this environment.' },
              { status: 503 },
            )
          }

          const { requester } = await requirePermission(request, 'manage_livestreams')
          const admin = getSupabaseAdminClient()

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
          const body = await request.json()
          const parsed = removeStreamSchema.safeParse(body)

          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          if (!hasSupabaseAdminConfig()) {
            return Response.json(
              { error: 'Admin livestream management requires SUPABASE_SERVICE_ROLE_KEY in this environment.' },
              { status: 503 },
            )
          }

          await requirePermission(request, 'manage_livestreams')
          const admin = getSupabaseAdminClient()

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
