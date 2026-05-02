import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, ShieldCheck, UserCog } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { formatRoleLabel, ORG_ROLE_LABELS, ORG_ROLES, type OrgRole } from '../lib/orgAccess'
import { authedFetch } from '../lib/supabaseBrowser'
import { requireAuthenticatedRoute } from '../lib/routeAuth'

type RoleRow = {
  email: string
  role: OrgRole
  granted_by: string | null
  banned_by: string | null
  ban_reason: string | null
  banned_until: string | null
  updated_at: string
  created_at: string
}

type PermissionRow = {
  permission_key: string
  label: string
  description: string
  superadmin_enabled: boolean
  admin_enabled: boolean
  manager_enabled: boolean
  staff_enabled: boolean
  moderator_enabled: boolean
  helper_enabled: boolean
  user_enabled: boolean
  banned_enabled: boolean
}

const roleBadgeClass: Record<OrgRole, string> = {
  superadmin: 'border-orange-300/60 text-orange-100',
  admin: 'border-cyan-400/40 text-cyan-200',
  manager: 'border-emerald-400/40 text-emerald-200',
  staff: 'border-sky-400/40 text-sky-200',
  moderator: 'border-fuchsia-400/40 text-fuchsia-200',
  helper: 'border-violet-400/40 text-violet-200',
  user: 'border-zinc-500/40 text-zinc-300',
  banned: 'border-rose-400/50 text-rose-200',
}

const permissionRoleKeys = ORG_ROLES.map((role) => ({
  role,
  field: `${role}_enabled` as keyof PermissionRow,
}))

export const Route = createFileRoute('/admin/users')({
  beforeLoad: async () => {
    await requireAuthenticatedRoute()
  },
  head: () => ({
    meta: [
      { title: 'Admin Users — W.A.G.E. Society' },
      {
        name: 'description',
        content: 'Manage users, roles, and permissions for the organization.',
      },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminUsersPage,
})

function AdminUsersPage() {
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [permissionMatrix, setPermissionMatrix] = useState<PermissionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [permissionSavingKey, setPermissionSavingKey] = useState('')
  const [error, setError] = useState('')
  const [requesterEmail, setRequesterEmail] = useState('')
  const [requestSource, setRequestSource] = useState('')
  const [requesterRole, setRequesterRole] = useState<OrgRole>('user')
  const [requesterPermissions, setRequesterPermissions] = useState<string[]>([])

  const [targetEmail, setTargetEmail] = useState('')
  const [targetRole, setTargetRole] = useState<OrgRole>('manager')
  const [banReason, setBanReason] = useState('')
  const [bannedUntil, setBannedUntil] = useState('')

  const isLocalSuperadmin = useMemo(() => requestSource === 'localhost-bypass', [requestSource])
  const canManagePermissions =
    requesterRole === 'superadmin' || isLocalSuperadmin || requesterPermissions.includes('manage_permissions')
  const canManageUsers = requesterRole === 'superadmin' || isLocalSuperadmin || requesterPermissions.includes('manage_users')

  const loadRoles = async () => {
    try {
      setError('')
      const res = await authedFetch('/api/admin/roles')
      const json = await res.json()

      if (!res.ok) {
        setError(json.error || 'Failed to load roles')
        setRoles([])
        return
      }

      setRoles(json.roles || [])
      setRequesterEmail(json.requester?.email || '')
      setRequestSource(json.requester?.source || '')
      setRequesterRole((json.requester?.role as OrgRole) || 'user')
      setRequesterPermissions(json.requester?.permissions || [])
    } catch {
      setError('Failed to load roles')
    }
  }

  const loadPermissionMatrix = async () => {
    try {
      setError('')
      const res = await authedFetch('/api/admin/permissions')
      const json = await res.json()

      if (!res.ok) {
        setError(json.error || 'Failed to load permission matrix')
        setPermissionMatrix([])
        return
      }

      setPermissionMatrix(json.matrix || [])
    } catch {
      setError('Failed to load permission matrix')
    }
  }

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await loadRoles()
      await loadPermissionMatrix()
      setLoading(false)
    })()
  }, [])

  const submitRoleUpdate = async (event: React.FormEvent) => {
    event.preventDefault()

    try {
      setSubmitting(true)
      setError('')
      const res = await authedFetch('/api/admin/roles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetEmail,
          role: targetRole,
          banReason: targetRole === 'banned' ? banReason.trim() || null : null,
          bannedUntil: targetRole === 'banned' && bannedUntil ? new Date(bannedUntil).toISOString() : null,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        setError(json.error || 'Failed to update role')
        return
      }

      setTargetEmail('')
      setTargetRole('manager')
      setBanReason('')
      setBannedUntil('')
      await loadRoles()
    } catch {
      setError('Failed to update role')
    } finally {
      setSubmitting(false)
    }
  }

  const togglePermission = async (role: OrgRole, permissionKey: string, enabled: boolean) => {
    if (!canManagePermissions) return

    try {
      setPermissionSavingKey(`${role}:${permissionKey}`)
      setError('')

      const res = await authedFetch('/api/admin/permissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role,
          permissionKey,
          enabled,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        setError(json.error || 'Failed to update permission')
        return
      }

      await loadPermissionMatrix()
    } catch {
      setError('Failed to update permission')
    } finally {
      setPermissionSavingKey('')
    }
  }

  return (
    <div className="min-h-screen px-4 py-12 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Admin / Users</p>
              <h1 className="mt-2 text-3xl font-black text-zinc-50 md:text-4xl">Users & Permissions</h1>
              <p className="mt-3 max-w-2xl text-zinc-300">
                Manage organization members, role hierarchy, bans, and permission matrix controls.
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                to="/admin"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300/35 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-100"
              >
                <ArrowLeft size={16} /> Admin Hub
              </Link>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300/35 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-100"
              >
                Dashboard
              </Link>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full border border-zinc-200/20 px-3 py-1 text-zinc-300">
              Active account: {requesterEmail || 'Unknown'}
            </span>
            <span className={`rounded-full border px-3 py-1 ${isLocalSuperadmin ? 'border-orange-300/60 text-orange-100' : 'border-cyan-400/50 text-cyan-200'}`}>
              {isLocalSuperadmin ? 'Localhost auto-superadmin' : `Authenticated ${formatRoleLabel(requesterRole)}`}
            </span>
            <span className={`rounded-full border px-3 py-1 ${canManagePermissions ? 'border-orange-300/60 text-orange-100' : 'border-zinc-500/50 text-zinc-300'}`}>
              Permission Management: {canManagePermissions ? 'Enabled' : 'Read only'}
            </span>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
          <article className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
            <div className="mb-4 flex items-center gap-2 text-orange-100">
              <UserCog size={18} />
              <h2 className="text-xl font-bold text-zinc-50">Set Member Role</h2>
            </div>

            <form onSubmit={submitRoleUpdate} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-200">Member Email</span>
                <input
                  type="email"
                  required
                  value={targetEmail}
                  onChange={(event) => setTargetEmail(event.target.value)}
                  className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                  placeholder="member@domain.com"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-200">Role</span>
                <select
                  value={targetRole}
                  onChange={(event) => setTargetRole(event.target.value as OrgRole)}
                  className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                >
                  {ORG_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {formatRoleLabel(role)}
                    </option>
                  ))}
                </select>
              </label>

              {targetRole === 'banned' ? (
                <>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-zinc-200">Ban Reason</span>
                    <textarea
                      required
                      value={banReason}
                      onChange={(event) => setBanReason(event.target.value)}
                      className="min-h-28 w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                      placeholder="Reason for the ban"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-zinc-200">Ban Until</span>
                    <input
                      type="datetime-local"
                      value={bannedUntil}
                      onChange={(event) => setBannedUntil(event.target.value)}
                      className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                    />
                  </label>
                </>
              ) : null}

              <button
                type="submit"
                disabled={submitting || !canManageUsers}
                className="w-full rounded-lg bg-orange-300 px-4 py-2.5 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? 'Saving...' : 'Save Role'}
              </button>
            </form>

            <p className="mt-4 text-xs text-zinc-400">
              Higher roles can manage lower roles only. Banned members lose all access by default.
            </p>
          </article>

          <article className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
            <div className="mb-4 flex items-center gap-2 text-orange-100">
              <ShieldCheck size={18} />
              <h2 className="text-xl font-bold text-zinc-50">Role Directory</h2>
            </div>

            {loading ? <p className="text-zinc-300">Loading roles...</p> : null}
            {error ? <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p> : null}

            {!loading && !error ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="text-zinc-400">
                    <tr>
                      <th className="pb-2 pr-2 font-medium">Email</th>
                      <th className="pb-2 pr-2 font-medium">Role</th>
                      <th className="pb-2 pr-2 font-medium">Granted By</th>
                      <th className="pb-2 pr-2 font-medium">Ban Details</th>
                      <th className="pb-2 font-medium">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map((row) => (
                      <tr key={row.email} className="border-t border-zinc-200/10 align-top">
                        <td className="py-3 pr-2 text-zinc-100">{row.email}</td>
                        <td className="py-3 pr-2">
                          <span className={`rounded-full border px-2 py-1 text-xs uppercase tracking-wide ${roleBadgeClass[row.role]}`}>
                            {ORG_ROLE_LABELS[row.role]}
                          </span>
                        </td>
                        <td className="py-3 pr-2 text-zinc-300">{row.granted_by || 'system'}</td>
                        <td className="py-3 pr-2 text-zinc-300">
                          {row.role === 'banned' ? (
                            <div className="space-y-1 text-xs">
                              <p>By: {row.banned_by || 'system'}</p>
                              <p>Reason: {row.ban_reason || 'No reason provided'}</p>
                              <p>Until: {row.banned_until ? new Date(row.banned_until).toLocaleString() : 'Forever'}</p>
                            </div>
                          ) : (
                            <span className="text-zinc-500">N/A</span>
                          )}
                        </td>
                        <td className="py-3 text-zinc-300">{new Date(row.updated_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </article>
        </section>

        <section className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
          <div className="mb-4 flex items-center gap-2 text-orange-100">
            <ShieldCheck size={18} />
            <h2 className="text-xl font-bold text-zinc-50">Permission Management</h2>
          </div>

          <p className="mb-4 text-sm text-zinc-300">
            Configure which dashboard and platform functions are available to each role.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1220px] text-left text-sm">
              <thead className="text-zinc-400">
                <tr>
                  <th className="pb-2 pr-2 font-medium">Permission</th>
                  <th className="pb-2 pr-2 font-medium">Description</th>
                  {ORG_ROLES.map((role) => (
                    <th key={role} className="pb-2 pr-2 font-medium">
                      {formatRoleLabel(role)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permissionMatrix.map((row) => (
                  <tr key={row.permission_key} className="border-t border-zinc-200/10">
                    <td className="py-3 pr-2">
                      <p className="font-semibold text-zinc-100">{row.label}</p>
                      <p className="text-xs uppercase tracking-wide text-zinc-500">{row.permission_key}</p>
                    </td>
                    <td className="py-3 pr-2 text-zinc-300">{row.description}</td>
                    {permissionRoleKeys.map(({ role, field }) => (
                      <td key={`${row.permission_key}:${role}`} className="py-3 pr-2">
                        <input
                          type="checkbox"
                          checked={Boolean(row[field])}
                          disabled={
                            !canManagePermissions ||
                            role === 'banned' ||
                            permissionSavingKey === `${role}:${row.permission_key}`
                          }
                          onChange={(event) => {
                            void togglePermission(role, row.permission_key, event.target.checked)
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
