import { createFileRoute } from '@tanstack/react-router'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { createAutoclipperJob, type AutoclipperStatus } from '../../../lib/autoclipper'
import { requirePermission } from '../../../lib/orgAuth'
import { getSupabaseAdminClient } from '../../../lib/supabaseAdmin'

const createSchema = z.object({
  commandText: z.string().trim().default('!clip'),
  streamPlatform: z.enum(['kick', 'twitch', 'youtube']).optional(),
  streamKey: z.string().trim().max(120).optional(),
  autoPost: z.boolean().default(true),
  autoCaption: z.boolean().default(true),
  platforms: z.array(z.string()).max(10).default(['x', 'kick', 'instagram']),
  clipWindowMinutes: z.number().int().min(1).max(15).default(5),
})

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['queued', 'processing', 'ready', 'posted', 'failed']),
  clipUrl: z.string().url().optional(),
  error: z.string().max(500).optional(),
})

const chatSchema = z.object({
  message: z.string().trim().min(1),
  user: z.string().trim().min(1).default('chat-bot@system.local'),
  streamPlatform: z.enum(['kick', 'twitch', 'youtube']).optional(),
  streamKey: z.string().trim().max(120).optional(),
  autoPost: z.boolean().default(true),
  autoCaption: z.boolean().default(true),
  platforms: z.array(z.string()).max(10).default(['x', 'kick', 'instagram']),
})

type DashboardToolEntryRow = {
  id: string
  title: string
  details: string
  status: string
  metadata: Record<string, unknown> | null
  created_by: string | null
  created_at: string
  updated_at: string
  event_date: string | null
}

function hasWebhookSecret(request: Request) {
  const secret = process.env.AUTOCLIPPER_WEBHOOK_SECRET
  if (!secret) return false
  const incoming = request.headers.get('x-autoclipper-secret') || ''

  const incomingBuffer = Buffer.from(incoming)
  const secretBuffer = Buffer.from(secret)
  if (incomingBuffer.length !== secretBuffer.length) return false

  try {
    return timingSafeEqual(incomingBuffer, secretBuffer)
  } catch {
    return false
  }
}

async function fetchAutoclipRows(limit = 100) {
  const admin = getSupabaseAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin.from('org_dashboard_tool_entries') as any)
    .select('id, title, details, status, metadata, created_by, created_at, updated_at, event_date')
    .eq('tool_key', 'promotion-hub')
    .contains('metadata', { kind: 'autoclip' })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data || []) as DashboardToolEntryRow[]
}

function mapRowsToJobs(rows: DashboardToolEntryRow[]) {
  return rows.map((row) => {
    const metadata = (row.metadata || {}) as Record<string, unknown>
    return {
      id: row.id,
      status: (metadata.status as AutoclipperStatus | undefined) || 'queued',
      command: String(metadata.command || '!clip'),
      source: String(metadata.source || 'dashboard'),
      requestedBy: String(metadata.requestedBy || row.created_by || 'unknown'),
      clipWindowMinutes: Number(metadata.clipWindowMinutes || 5),
      streamPlatform: metadata.streamPlatform || null,
      streamKey: metadata.streamKey || null,
      autoPost: Boolean(metadata.autoPost),
      autoCaption: Boolean(metadata.autoCaption),
      platforms: Array.isArray(metadata.platforms) ? metadata.platforms : [],
      caption: String(metadata.caption || ''),
      clipUrl: metadata.clipUrl || null,
      queuedPostId: metadata.queuedPostId || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  })
}

async function updateAutoclipJobStatus(input: {
  id: string
  status: AutoclipperStatus
  clipUrl?: string
  error?: string
  updatedBy: string
  note?: string
}) {
  const admin = getSupabaseAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: fetchError } = await (admin.from('org_dashboard_tool_entries') as any)
    .select('id, metadata')
    .eq('id', input.id)
    .eq('tool_key', 'promotion-hub')
    .contains('metadata', { kind: 'autoclip' })
    .maybeSingle()

  if (fetchError) throw new Error(fetchError.message)
  if (!existing) throw new Error('Clip job not found.')

  const metadata = (existing.metadata || {}) as Record<string, unknown>
  const nextMetadata: Record<string, unknown> = {
    ...metadata,
    status: input.status,
    clipUrl: input.clipUrl || metadata.clipUrl || null,
  }

  if (input.error) nextMetadata.error = input.error
  if (input.note) nextMetadata.discordNote = input.note

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (admin.from('org_dashboard_tool_entries') as any)
    .update({
      status:
        input.status === 'posted'
          ? 'done'
          : input.status === 'failed'
          ? 'blocked'
          : 'active',
      metadata: nextMetadata,
      updated_by: input.updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.id)

  if (updateError) throw new Error(updateError.message)
}

export const Route = createFileRoute('/api/live/clips')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          if (hasWebhookSecret(request)) {
            const rows = await fetchAutoclipRows(20)
            const jobs = mapRowsToJobs(rows)
            return Response.json({ jobs })
          }

          const access = await requirePermission(request, 'use_autoclipper')
          const rows = await fetchAutoclipRows(100)
          const jobs = mapRowsToJobs(rows)

          return Response.json({
            requester: {
              ...access.requester,
              role: access.role,
            },
            jobs,
          })
        } catch (error) {
          if (error instanceof Response) return error
          const message = error instanceof Error ? error.message : 'Unexpected server error'
          return Response.json({ error: message }, { status: 500 })
        }
      },

      POST: async ({ request }) => {
        try {
          const body = await request.json()
          if (hasWebhookSecret(request)) {
            const parsedChat = chatSchema.safeParse(body)
            if (!parsedChat.success) {
              return Response.json({ error: 'Invalid payload', details: parsedChat.error.flatten() }, { status: 400 })
            }

            if (!parsedChat.data.message.toLowerCase().startsWith('!clip')) {
              return Response.json({ ignored: true, reason: 'Message is not a !clip command.' })
            }

            const result = await createAutoclipperJob({
              requestedBy: parsedChat.data.user,
              source: 'chat',
              commandText: parsedChat.data.message,
              streamPlatform: parsedChat.data.streamPlatform || null,
              streamKey: parsedChat.data.streamKey || null,
              autoPost: parsedChat.data.autoPost,
              autoCaption: parsedChat.data.autoCaption,
              platforms: parsedChat.data.platforms,
              clipWindowMinutes: 5,
            })

            return Response.json({ ok: true, ...result })
          }

          const access = await requirePermission(request, 'use_autoclipper')
          const parsed = createSchema.safeParse(body)
          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          const commandText = parsed.data.commandText || '!clip'
          if (!commandText.toLowerCase().startsWith('!clip')) {
            return Response.json({ error: 'commandText must begin with !clip' }, { status: 400 })
          }

          const result = await createAutoclipperJob({
            requestedBy: access.requester.email,
            source: 'dashboard',
            commandText,
            streamPlatform: parsed.data.streamPlatform || null,
            streamKey: parsed.data.streamKey || null,
            autoPost: parsed.data.autoPost,
            autoCaption: parsed.data.autoCaption,
            platforms: parsed.data.platforms,
            clipWindowMinutes: parsed.data.clipWindowMinutes,
          })

          return Response.json({ ok: true, ...result })
        } catch (error) {
          if (error instanceof Response) return error
          const message = error instanceof Error ? error.message : 'Unexpected server error'
          return Response.json({ error: message }, { status: 500 })
        }
      },

      PUT: async ({ request }) => {
        try {
          const body = await request.json()
          const parsed = updateSchema.safeParse(body)
          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          if (hasWebhookSecret(request)) {
            await updateAutoclipJobStatus({
              id: parsed.data.id,
              status: parsed.data.status,
              clipUrl: parsed.data.clipUrl,
              error: parsed.data.error,
              updatedBy: 'discord-bot',
            })
            return Response.json({ ok: true })
          }

          const access = await requirePermission(request, 'manage_livestreams')

          await updateAutoclipJobStatus({
            id: parsed.data.id,
            status: parsed.data.status,
            clipUrl: parsed.data.clipUrl,
            error: parsed.data.error,
            updatedBy: access.requester.email,
          })

          return Response.json({ ok: true })
        } catch (error) {
          if (error instanceof Response) return error
          const message = error instanceof Error ? error.message : 'Unexpected server error'
          return Response.json({ error: message }, { status: 500 })
        }
      },
    },
  },
})
