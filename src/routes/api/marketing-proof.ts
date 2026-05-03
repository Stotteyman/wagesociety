import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '../../lib/orgAuth'
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin'

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

export const Route = createFileRoute('/api/marketing-proof')({
  server: {
    handlers: {
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
