import { getSupabaseAdminClient } from './supabaseAdmin'

export type AutoclipperStatus = 'queued' | 'processing' | 'ready' | 'posted' | 'failed'

type CreateAutoclipperJobInput = {
  requestedBy: string
  source: 'chat' | 'dashboard' | 'discord'
  commandText: string
  streamPlatform?: 'kick' | 'twitch' | 'youtube' | null
  streamKey?: string | null
  autoPost: boolean
  autoCaption: boolean
  platforms: string[]
  clipWindowMinutes?: number
}

function normalizePlatforms(platforms: string[]) {
  const allow = new Set(['x', 'threads', 'instagram', 'kick', 'twitch'])
  return Array.from(new Set(platforms.map((p) => p.trim().toLowerCase()).filter((p) => allow.has(p))))
}

function buildAutoCaption(input: CreateAutoclipperJobInput) {
  const platform = input.streamPlatform ? input.streamPlatform.toUpperCase() : 'LIVE'
  const key = input.streamKey ? ` @${input.streamKey}` : ''
  const timestamp = new Date().toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `Fresh ${input.clipWindowMinutes || 5}m clip from ${platform}${key}. Highlight dropped at ${timestamp}. #WAGESociety #Creator`
}

export async function createAutoclipperJob(input: CreateAutoclipperJobInput) {
  const admin = getSupabaseAdminClient()
  const safePlatforms = normalizePlatforms(input.platforms)
  const clipWindowMinutes = Math.max(1, Math.min(15, input.clipWindowMinutes || 5))
  const caption = input.autoCaption ? buildAutoCaption({ ...input, clipWindowMinutes }) : ''

  const clipMetadata = {
    kind: 'autoclip',
    status: 'queued',
    source: input.source,
    requestedBy: input.requestedBy,
    command: input.commandText,
    clipWindowMinutes,
    autoPost: input.autoPost,
    autoCaption: input.autoCaption,
    platforms: safePlatforms,
    streamPlatform: input.streamPlatform || null,
    streamKey: input.streamKey || null,
    caption,
    clipRequestedAt: new Date().toISOString(),
    clipUrl: null as string | null,
  }

  const { data: clipJob, error: clipError } = await admin
    .from('org_dashboard_tool_entries')
    .insert({
      tool_key: 'promotion-hub',
      title: `Autoclip requested by ${input.requestedBy}`,
      details: caption || `Processing ${clipWindowMinutes} minute clip from chat command ${input.commandText}`,
      status: 'active',
      event_date: new Date().toISOString(),
      metadata: clipMetadata,
      created_by: input.requestedBy,
      updated_by: input.requestedBy,
    })
    .select('id, metadata, created_at, updated_at')
    .single()

  if (clipError) throw new Error(clipError.message)

  let queuedPostId: string | null = null

  if (input.autoPost && safePlatforms.length > 0) {
    const { data: queuedPost, error: postError } = await admin
      .from('org_dashboard_tool_entries')
      .insert({
        tool_key: 'promotion-hub',
        title: (caption || `New clip from ${input.streamPlatform || 'live stream'}`).slice(0, 160),
        details: caption,
        status: 'planned',
        event_date: new Date().toISOString(),
        metadata: {
          kind: 'autoclip-social',
          clipJobId: clipJob.id,
          autoCaption: input.autoCaption,
          autoPost: input.autoPost,
          platforms: safePlatforms,
        },
        created_by: input.requestedBy,
        updated_by: input.requestedBy,
      })
      .select('id')
      .single()

    if (!postError && queuedPost?.id) {
      queuedPostId = queuedPost.id
      await admin
        .from('org_dashboard_tool_entries')
        .update({
          metadata: {
            ...(clipJob.metadata || {}),
            queuedPostId,
          },
          updated_by: input.requestedBy,
          updated_at: new Date().toISOString(),
        })
        .eq('id', clipJob.id)
    }
  }

  return {
    clipJobId: clipJob.id,
    queuedPostId,
    caption,
    platforms: safePlatforms,
  }
}
