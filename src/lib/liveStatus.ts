type StreamPlatform = 'twitch' | 'youtube' | 'kick'

export type StreamStatus = 'live' | 'offline'

export type LivestreamSnapshot = {
  status: StreamStatus
  viewerCount: number | null
  followerCount: number | null
  accountCreatedAt: string | null
}

export type ParsedStreamLink = {
  platform: StreamPlatform
  streamKey: string
}

type KickTokenCache = {
  accessToken: string
  expiresAt: number
}

let kickTokenCache: KickTokenCache | null = null

const OFFLINE_SNAPSHOT: LivestreamSnapshot = {
  status: 'offline',
  viewerCount: null,
  followerCount: null,
  accountCreatedAt: null,
}

function isHostMatch(hostname: string, domain: string) {
  const normalizedHost = hostname.toLowerCase()
  const normalizedDomain = domain.toLowerCase()
  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`)
}

function extractYouTubeChannelRef(url: URL): string | null {
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length === 0) return null

  const [first, second] = segments

  if (first.startsWith('@')) {
    return `handle:${first.toLowerCase()}`
  }

  if (first === 'channel' && second) {
    return `channel:${second}`
  }

  if (first === 'user' && second) {
    return `user:${second}`
  }

  if (first === 'c' && second) {
    return `custom:${second}`
  }

  return null
}

function extractYouTubeVideoId(url: URL): string | null {
  if (url.hostname.includes('youtube.com')) {
    if (url.pathname === '/watch') {
      const id = url.searchParams.get('v')
      return id || null
    }

    if (url.pathname.startsWith('/live/')) {
      return url.pathname.split('/').filter(Boolean)[1] || null
    }
  }

  if (url.hostname === 'youtu.be') {
    return url.pathname.split('/').filter(Boolean)[0] || null
  }

  return null
}

function extractTwitchChannel(url: URL): string | null {
  if (!isHostMatch(url.hostname, 'twitch.tv')) return null

  const slug = url.pathname.split('/').filter(Boolean)[0]
  if (!slug) return null

  const reserved = new Set(['directory', 'settings', 'login', 'signup'])
  if (reserved.has(slug.toLowerCase())) return null

  return slug.toLowerCase()
}

function extractKickChannel(url: URL): string | null {
  if (!isHostMatch(url.hostname, 'kick.com')) return null

  const slug = url.pathname.split('/').filter(Boolean)[0]
  if (!slug) return null

  const reserved = new Set(['categories', 'search', 'video', 'settings', 'login', 'signup'])
  if (reserved.has(slug.toLowerCase())) return null

  return slug.toLowerCase()
}

export function parseLivestreamLink(rawUrl: string): ParsedStreamLink {
  let url: URL

  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Invalid URL format')
  }

  const host = url.hostname.toLowerCase()

  if (isHostMatch(host, 'twitch.tv')) {
    const channel = extractTwitchChannel(url)
    if (!channel) throw new Error('Could not parse Twitch channel from link')

    return {
      platform: 'twitch',
      streamKey: channel,
    }
  }

  if (isHostMatch(host, 'youtube.com') || host === 'youtu.be') {
    const channelRef = extractYouTubeChannelRef(url)
    if (!channelRef) {
      throw new Error('Could not parse YouTube channel from link. Use a channel URL like /@handle or /channel/UC....')
    }

    return {
      platform: 'youtube',
      streamKey: channelRef,
    }
  }

  if (isHostMatch(host, 'kick.com')) {
    const channel = extractKickChannel(url)
    if (!channel) throw new Error('Could not parse Kick channel from link')

    return {
      platform: 'kick',
      streamKey: channel,
    }
  }

  throw new Error('Unsupported platform. Only Twitch, YouTube, and Kick are currently supported.')
}

function parseStoredYouTubeKey(streamKey: string) {
  if (streamKey.startsWith('handle:')) {
    return { kind: 'handle' as const, value: streamKey.slice('handle:'.length) }
  }

  if (streamKey.startsWith('channel:')) {
    return { kind: 'channel' as const, value: streamKey.slice('channel:'.length) }
  }

  if (streamKey.startsWith('user:')) {
    return { kind: 'user' as const, value: streamKey.slice('user:'.length) }
  }

  if (streamKey.startsWith('custom:')) {
    return { kind: 'custom' as const, value: streamKey.slice('custom:'.length) }
  }

  return { kind: 'video' as const, value: streamKey }
}

async function fetchYouTubeChannelById(channelId: string, apiKey: string) {
  const channelUrl = new URL('https://www.googleapis.com/youtube/v3/channels')
  channelUrl.searchParams.set('part', 'snippet,statistics')
  channelUrl.searchParams.set('id', channelId)
  channelUrl.searchParams.set('key', apiKey)

  const response = await fetch(channelUrl.toString(), { method: 'GET' })
  if (!response.ok) return null

  const data = (await response.json()) as {
    items?: Array<{
      id?: string
      snippet?: { publishedAt?: string; customUrl?: string; title?: string }
      statistics?: { subscriberCount?: string }
    }>
  }

  return data.items?.[0] || null
}

async function resolveYouTubeChannel(streamKey: string, apiKey: string) {
  const parsed = parseStoredYouTubeKey(streamKey)

  if (parsed.kind === 'channel') {
    const channel = await fetchYouTubeChannelById(parsed.value, apiKey)
    if (!channel?.id) return null
    return channel
  }

  if (parsed.kind === 'handle') {
    const handle = parsed.value.startsWith('@') ? parsed.value : `@${parsed.value}`
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search')
    searchUrl.searchParams.set('part', 'snippet')
    searchUrl.searchParams.set('type', 'channel')
    searchUrl.searchParams.set('q', handle)
    searchUrl.searchParams.set('maxResults', '5')
    searchUrl.searchParams.set('key', apiKey)

    const response = await fetch(searchUrl.toString(), { method: 'GET' })
    if (!response.ok) return null

    const data = (await response.json()) as {
      items?: Array<{
        id?: { channelId?: string }
        snippet?: { channelTitle?: string; customUrl?: string }
      }>
    }

    const matched = data.items?.find((item) => {
      const customUrl = item.snippet?.customUrl?.toLowerCase()
      return customUrl === handle.toLowerCase()
    }) || data.items?.[0]

    const channelId = matched?.id?.channelId
    if (!channelId) return null
    return fetchYouTubeChannelById(channelId, apiKey)
  }

  if (parsed.kind === 'user' || parsed.kind === 'custom') {
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search')
    searchUrl.searchParams.set('part', 'snippet')
    searchUrl.searchParams.set('type', 'channel')
    searchUrl.searchParams.set('q', parsed.value)
    searchUrl.searchParams.set('maxResults', '5')
    searchUrl.searchParams.set('key', apiKey)

    const response = await fetch(searchUrl.toString(), { method: 'GET' })
    if (!response.ok) return null

    const data = (await response.json()) as {
      items?: Array<{
        id?: { channelId?: string }
        snippet?: { channelTitle?: string; customUrl?: string }
      }>
    }

    const query = parsed.value.toLowerCase()
    const matched = data.items?.find((item) => {
      const title = item.snippet?.channelTitle?.toLowerCase()
      const customUrl = item.snippet?.customUrl?.replace(/^@/, '').toLowerCase()
      return title === query || customUrl === query
    }) || data.items?.[0]

    const channelId = matched?.id?.channelId
    if (!channelId) return null
    return fetchYouTubeChannelById(channelId, apiKey)
  }

  return null
}

async function getYouTubeSnapshot(videoId: string): Promise<LivestreamSnapshot> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    return OFFLINE_SNAPSHOT
  }

  const parsed = parseStoredYouTubeKey(videoId)

  if (parsed.kind !== 'video') {
    const channel = await resolveYouTubeChannel(videoId, apiKey)
    if (!channel?.id) {
      return OFFLINE_SNAPSHOT
    }

    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search')
    searchUrl.searchParams.set('part', 'snippet')
    searchUrl.searchParams.set('channelId', channel.id)
    searchUrl.searchParams.set('eventType', 'live')
    searchUrl.searchParams.set('type', 'video')
    searchUrl.searchParams.set('maxResults', '1')
    searchUrl.searchParams.set('key', apiKey)

    const searchResponse = await fetch(searchUrl.toString(), {
      method: 'GET',
    })

    let liveVideoId: string | null = null
    if (searchResponse.ok) {
      const searchData = (await searchResponse.json()) as {
        items?: Array<{
          id?: { videoId?: string }
        }>
      }
      liveVideoId = searchData.items?.[0]?.id?.videoId || null
    }

    if (!liveVideoId) {
      return {
        status: 'offline',
        viewerCount: null,
        followerCount: channel.statistics?.subscriberCount
          ? Number.parseInt(channel.statistics.subscriberCount, 10)
          : null,
        accountCreatedAt: channel.snippet?.publishedAt || null,
      }
    }

    const liveSnapshot = await getYouTubeSnapshot(liveVideoId)
    return {
      ...liveSnapshot,
      followerCount: channel.statistics?.subscriberCount
        ? Number.parseInt(channel.statistics.subscriberCount, 10)
        : liveSnapshot.followerCount,
      accountCreatedAt: channel.snippet?.publishedAt || liveSnapshot.accountCreatedAt,
    }
  }

  const apiUrl = new URL('https://www.googleapis.com/youtube/v3/videos')
  apiUrl.searchParams.set('part', 'snippet,liveStreamingDetails')
  apiUrl.searchParams.set('id', parsed.value)
  apiUrl.searchParams.set('key', apiKey)

  const response = await fetch(apiUrl.toString(), {
    method: 'GET',
  })

  if (!response.ok) {
    return OFFLINE_SNAPSHOT
  }

  const data = (await response.json()) as {
    items?: Array<{
      snippet?: {
        liveBroadcastContent?: string
        channelId?: string
      }
      liveStreamingDetails?: {
        actualStartTime?: string
        actualEndTime?: string
        concurrentViewers?: string
      }
    }>
  }

  const item = data.items?.[0]
  if (!item) return OFFLINE_SNAPSHOT

  const viewerCountRaw = item.liveStreamingDetails?.concurrentViewers
  const viewerCount = viewerCountRaw ? Number.parseInt(viewerCountRaw, 10) : null

  let followerCount: number | null = null
  let accountCreatedAt: string | null = null

  const channelId = item.snippet?.channelId
  if (channelId) {
    const channelUrl = new URL('https://www.googleapis.com/youtube/v3/channels')
    channelUrl.searchParams.set('part', 'snippet,statistics')
    channelUrl.searchParams.set('id', channelId)
    channelUrl.searchParams.set('key', apiKey)

    const channelResponse = await fetch(channelUrl.toString(), {
      method: 'GET',
    })

    if (channelResponse.ok) {
      const channelData = (await channelResponse.json()) as {
        items?: Array<{
          snippet?: { publishedAt?: string }
          statistics?: { subscriberCount?: string }
        }>
      }

      const channel = channelData.items?.[0]
      followerCount = channel?.statistics?.subscriberCount
        ? Number.parseInt(channel.statistics.subscriberCount, 10)
        : null
      accountCreatedAt = channel?.snippet?.publishedAt || null
    }
  }

  const started = !!item.liveStreamingDetails?.actualStartTime
  const ended = !!item.liveStreamingDetails?.actualEndTime
  const isLive = item.snippet?.liveBroadcastContent === 'live' || (started && !ended)

  return {
    status: isLive ? 'live' : 'offline',
    viewerCount,
    followerCount,
    accountCreatedAt,
  }
}

async function getTwitchSnapshot(channelLogin: string): Promise<LivestreamSnapshot> {
  const clientId = process.env.TWITCH_CLIENT_ID
  const clientSecret = process.env.TWITCH_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return OFFLINE_SNAPSHOT
  }

  const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  })

  if (!tokenResponse.ok) {
    return OFFLINE_SNAPSHOT
  }

  const tokenData = (await tokenResponse.json()) as { access_token?: string }
  if (!tokenData.access_token) {
    return OFFLINE_SNAPSHOT
  }

  const headers = {
    'Client-Id': clientId,
    Authorization: `Bearer ${tokenData.access_token}`,
  }

  let userId: string | null = null
  let accountCreatedAt: string | null = null

  const userResponse = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(channelLogin)}`, {
    headers,
  })

  if (userResponse.ok) {
    const userData = (await userResponse.json()) as {
      data?: Array<{
        id?: string
        created_at?: string
      }>
    }

    const user = userData.data?.[0]
    userId = user?.id || null
    accountCreatedAt = user?.created_at || null
  }

  const streamResponse = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(channelLogin)}`, {
    headers,
  })

  if (!streamResponse.ok) {
    return {
      ...OFFLINE_SNAPSHOT,
      accountCreatedAt,
    }
  }

  const streamData = (await streamResponse.json()) as {
    data?: Array<{
      viewer_count?: number
    }>
  }

  const liveStream = streamData.data?.[0]
  const viewerCount = liveStream?.viewer_count ?? null

  let followerCount: number | null = null

  if (userId) {
    const followersResponse = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${encodeURIComponent(userId)}`, {
      headers,
    })

    if (followersResponse.ok) {
      const followersData = (await followersResponse.json()) as { total?: number }
      followerCount = typeof followersData.total === 'number' ? followersData.total : null
    }
  }

  return {
    status: liveStream ? 'live' : 'offline',
    viewerCount,
    followerCount,
    accountCreatedAt,
  }
}

async function getKickSnapshot(channelSlug: string): Promise<LivestreamSnapshot> {
  const kickClientId = process.env.KICK_CLIENT_ID
  const kickClientSecret = process.env.KICK_CLIENT_SECRET

  // Prefer the official authenticated API for consistent server-side access.
  if (kickClientId && kickClientSecret) {
    const officialSnapshot = await getKickSnapshotFromOfficialApi(channelSlug, kickClientId, kickClientSecret)
    if (officialSnapshot) {
      return officialSnapshot
    }
  }

  const encodedSlug = encodeURIComponent(channelSlug)
  const endpoints = [
    `https://kick.com/api/v2/channels/${encodedSlug}`,
    `https://kick.com/api/v2/channels/${encodedSlug}/livestream`,
    `https://kick.com/api/v1/channels/${encodedSlug}`,
    `https://kick.com/api/v1/channels/${encodedSlug}/livestream`,
  ]

  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        Referer: 'https://kick.com/',
        Origin: 'https://kick.com',
      },
    })

    if (!response.ok) {
      continue
    }

    const data = (await response.json()) as {
      is_live?: boolean | null
      viewer_count?: number | null
      followers_count?: number | null
      created_at?: string | null
      livestream?: {
        id?: number | string
        viewer_count?: number | null
      } | null
      user?: {
        created_at?: string | null
      } | null
      data?: {
        is_live?: boolean | null
        viewer_count?: number | null
        followers_count?: number | null
        created_at?: string | null
        livestream?: {
          id?: number | string
          viewer_count?: number | null
        } | null
        user?: {
          created_at?: string | null
        } | null
      } | null
    }

    const livestreamId = data.livestream?.id ?? data.data?.livestream?.id
    const isLiveFlag = data.is_live ?? data.data?.is_live
    const viewerCount =
      data.livestream?.viewer_count ?? data.data?.livestream?.viewer_count ?? data.viewer_count ?? data.data?.viewer_count ?? null
    const followerCount = data.followers_count ?? data.data?.followers_count ?? null
    const accountCreatedAt = data.user?.created_at ?? data.data?.user?.created_at ?? data.created_at ?? data.data?.created_at ?? null

    return {
      status: livestreamId || isLiveFlag === true ? 'live' : 'offline',
      viewerCount,
      followerCount,
      accountCreatedAt,
    }
  }

  // Final fallback: parse the public channel HTML payload. This helps when API
  // endpoints are blocked or changed in serverless environments.
  const pageResponse = await fetch(`https://kick.com/${encodedSlug}`, {
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      Referer: 'https://kick.com/',
    },
  })

  if (pageResponse.ok) {
    const html = await pageResponse.text()
    const isLive = /"is_live"\s*:\s*true/i.test(html)

    const viewerMatch = html.match(/"viewer_count"\s*:\s*(\d+)/i)
    const followerMatch = html.match(/"followers?_count"\s*:\s*(\d+)/i)
    const createdAtMatch = html.match(/"created_at"\s*:\s*"([^"]+)"/i)

    return {
      status: isLive ? 'live' : 'offline',
      viewerCount: viewerMatch ? Number.parseInt(viewerMatch[1], 10) : null,
      followerCount: followerMatch ? Number.parseInt(followerMatch[1], 10) : null,
      accountCreatedAt: createdAtMatch?.[1] || null,
    }
  }

  return OFFLINE_SNAPSHOT
}

async function getKickSnapshotFromOfficialApi(
  channelSlug: string,
  clientId: string,
  clientSecret: string
): Promise<LivestreamSnapshot | null> {
  const accessToken = await getKickAppAccessToken(clientId, clientSecret)
  if (!accessToken) {
    return null
  }

  const channelsUrl = new URL('https://api.kick.com/public/v1/channels')
  channelsUrl.searchParams.append('slug', channelSlug)

  const response = await fetch(channelsUrl.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': clientId,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    return null
  }

  const data = (await response.json()) as {
    data?: Array<{
      stream?: {
        is_live?: boolean | null
        viewer_count?: number | null
      } | null
      followers_count?: number | null
      follower_count?: number | null
      created_at?: string | null
      user?: {
        created_at?: string | null
      } | null
    }>
  }

  const channel = data.data?.[0]
  if (!channel) {
    return OFFLINE_SNAPSHOT
  }

  const isLive = channel.stream?.is_live === true
  const viewerCount = channel.stream?.viewer_count ?? null
  const followerCount = channel.followers_count ?? channel.follower_count ?? null
  const accountCreatedAt = channel.user?.created_at ?? channel.created_at ?? null

  return {
    status: isLive || (viewerCount || 0) > 0 ? 'live' : 'offline',
    viewerCount,
    followerCount,
    accountCreatedAt,
  }
}

async function getKickAppAccessToken(clientId: string, clientSecret: string): Promise<string | null> {
  const now = Date.now()
  if (kickTokenCache && now < kickTokenCache.expiresAt) {
    return kickTokenCache.accessToken
  }

  const response = await fetch('https://id.kick.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!response.ok) {
    return null
  }

  const data = (await response.json()) as {
    access_token?: string
    expires_in?: number
  }

  if (!data.access_token) {
    return null
  }

  // Refresh one minute before expiry to avoid edge expiry races.
  const expiresInMs = Math.max((data.expires_in || 3600) - 60, 60) * 1000
  kickTokenCache = {
    accessToken: data.access_token,
    expiresAt: now + expiresInMs,
  }

  return data.access_token
}

export async function getLivestreamStatus(platform: StreamPlatform, streamKey: string): Promise<StreamStatus> {
  const snapshot = await getLivestreamSnapshot(platform, streamKey)
  return snapshot.status
}

export async function getLivestreamSnapshot(platform: StreamPlatform, streamKey: string): Promise<LivestreamSnapshot> {
  try {
    if (platform === 'youtube') {
      return await getYouTubeSnapshot(streamKey)
    }

    if (platform === 'kick') {
      return await getKickSnapshot(streamKey)
    }

    return await getTwitchSnapshot(streamKey)
  } catch {
    return OFFLINE_SNAPSHOT
  }
}
