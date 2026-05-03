import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { getRequesterAccess, requirePermission } from '../../lib/orgAuth'
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin'

const SUBSCRIBE_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000
const SUBSCRIBE_RATE_LIMIT_MAX_REQUESTS = 10
const subscribeRequestLog = new Map<string, number[]>()

function getQuarterStartIso(now: Date) {
  const quarter = Math.floor(now.getUTCMonth() / 3)
  const quarterStartMonth = quarter * 3
  return new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1, 0, 0, 0, 0)).toISOString()
}

function average(values: number[]) {
  if (!values.length) return null
  const total = values.reduce((sum, value) => sum + value, 0)
  return total / values.length
}

function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for') || ''
  const firstForwarded = forwardedFor.split(',')[0]?.trim()
  if (firstForwarded) return firstForwarded
  return request.headers.get('x-real-ip') || 'unknown'
}

function isRateLimited(request: Request) {
  const key = getRequestIp(request)
  const now = Date.now()
  const cutoff = now - SUBSCRIBE_RATE_LIMIT_WINDOW_MS
  const prior = subscribeRequestLog.get(key) || []
  const active = prior.filter((value) => value >= cutoff)

  if (active.length >= SUBSCRIBE_RATE_LIMIT_MAX_REQUESTS) {
    subscribeRequestLog.set(key, active)
    return true
  }

  active.push(now)
  subscribeRequestLog.set(key, active)
  return false
}

const subscribeSchema = z.object({
  email: z.string().trim().email().max(200),
  liveAlerts: z.boolean().default(true),
  newsletter: z.boolean().default(true),
  productUpdates: z.boolean().default(false),
  communityUpdates: z.boolean().default(false),
  source: z.string().trim().max(60).optional(),
})

export const Route = createFileRoute('/api/marketing-proof')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Require authentication to subscribe
          const access = await getRequesterAccess(request)

          if (isRateLimited(request)) {
            return Response.json(
              { error: 'Too many requests. Please wait and try again.' },
              { status: 429 },
            )
          }

          const body = await request.json()
          const parsed = subscribeSchema.safeParse(body)

          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload' }, { status: 400 })
          }

          const { email, liveAlerts, newsletter, productUpdates, communityUpdates, source } = parsed.data

          // Enforce that subscription email matches authenticated user's account email
          const requestedEmail = email.toLowerCase()
          const accountEmail = access.requester.email.toLowerCase()

          if (requestedEmail !== accountEmail) {
            return Response.json(
              { error: 'Subscription email must match your account email.' },
              { status: 403 },
            )
          }

          if (!liveAlerts && !newsletter && !productUpdates && !communityUpdates) {
            return Response.json({ error: 'Please choose at least one notification type.' }, { status: 400 })
          }

          const admin = getSupabaseAdminClient()
          const { error } = await admin.from('notification_subscribers').upsert(
            {
              email: requestedEmail,
              live_alerts: liveAlerts,
              newsletter,
              product_updates: productUpdates,
              community_updates: communityUpdates,
              source: source || 'app',
              status: 'active',
              subscribed_at: new Date().toISOString(),
              unsubscribed_at: null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'email' },
          )

          if (error) return Response.json({ error: 'Could not save subscription right now.' }, { status: 500 })
          return Response.json({ ok: true, subscribed: true })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },
      GET: async ({ request }) => {
        try {
          await requirePermission(request, 'access_admin_dashboard')
          const admin = getSupabaseAdminClient()
          const quarterStartIso = getQuarterStartIso(new Date())

          const [
            { count: activeMembersCount, error: membersError },
            { count: winsThisQuarterCount, error: winsError },
            { data: completedEntriesData, error: completedEntriesError },
          ] = await Promise.all([
            admin
              .from('org_user_roles')
              .select('email', { head: true, count: 'exact' })
              .neq('role', 'banned'),
            admin
              .from('org_dashboard_tool_entries')
              .select('id', { head: true, count: 'exact' })
              .eq('status', 'done')
              .gte('updated_at', quarterStartIso),
            admin
              .from('org_dashboard_tool_entries')
              .select('created_at, updated_at')
              .eq('status', 'done')
              .not('updated_at', 'is', null)
              .limit(1000),
          ])

          if (membersError) return Response.json({ error: membersError.message }, { status: 500 })
          if (winsError) return Response.json({ error: winsError.message }, { status: 500 })
          if (completedEntriesError) return Response.json({ error: completedEntriesError.message }, { status: 500 })

          const completionHours = (completedEntriesData || [])
            .map((entry) => {
              const createdAt = new Date(entry.created_at).getTime()
              const updatedAt = new Date(entry.updated_at).getTime()
              if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) return null
              const diffMs = updatedAt - createdAt
              if (diffMs < 0) return null
              return diffMs / (1000 * 60 * 60)
            })
            .filter((value): value is number => value !== null)

          return Response.json({
            activeMembers: activeMembersCount || 0,
            memberWinsThisQuarter: winsThisQuarterCount || 0,
            averageTimeToFirstActionHours: average(completionHours),
            sampleSize: completionHours.length,
            asOf: new Date().toISOString(),
          })
        } catch {
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },
    },
  },
})
