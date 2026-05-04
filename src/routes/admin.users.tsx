import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Ban, Check, ChevronDown, ShieldCheck, UserCog, Users } from 'lucide-react'
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
  user_id?: string | null
  display_name?: string | null
  membership_plan?: string | null
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  effective_permissions?: string[]
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
  superadmin: 'border-orange-300/60 bg-orange-400/10 text-orange-200',
  admin: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200',
  manager: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  staff: 'border-sky-400/40 bg-sky-400/10 text-sky-200',
  moderator: 'border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-200',
  helper: 'border-violet-400/40 bg-violet-400/10 text-violet-200',
  user: 'border-zinc-500/40 bg-zinc-800/40 text-zinc-300',
  banned: 'border-rose-400/50 bg-rose-500/10 text-rose-200',
}

// Roles that show up in the permission tab selector (exclude banned — no permissions)
const PERMISSION_ROLES = ORG_ROLES.filter((r) => r !== 'banned')

export const Route = createFileRoute('/admin/users')({
  beforeLoad: async () => {
    await requireAuthenticatedRoute()
  },
  head: () => ({
    meta: [
      { title: 'Admin Users — W.A.G.E. Society' },
      { name: 'description', content: 'Manage members, roles, and permissions.' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminUsersPage,
})

function AdminUsersPage() {
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [permissionMatrix, setPermissionMatrix] = useState<PermissionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [requesterEmail, setRequesterEmail] = useState('')
  const [requestSource, setRequestSource] = useState('')
  const [requesterRole, setRequesterRole] = useState<OrgRole>('user')
  const [requesterPermissions, setRequesterPermissions] = useState<string[]>([])

  // Role assignment form
  const [formEmail, setFormEmail] = useState('')
  const [memberSearchOpen, setMemberSearchOpen] = useState(false)
  const [formRole, setFormRole] = useState<OrgRole>('manager')
  const [banReason, setBanReason] = useState('')
  const [bannedUntil, setBannedUntil] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  // Permission panel
  const [activePermRole, setActivePermRole] = useState<OrgRole>('admin')
  const [permSavingKey, setPermSavingKey] = useState('')

  const isLocalSuperadmin = useMemo(() => requestSource === 'localhost-bypass', [requestSource])
  const canManagePerms = requesterRole === 'superadmin' || isLocalSuperadmin || requesterPermissions.includes('manage_permissions')
  const canManageUsers = requesterRole === 'superadmin' || isLocalSuperadmin || requesterPermissions.includes('manage_users')

  const memberSuggestions = useMemo(() => {
    const query = formEmail.trim().toLowerCase()
    const rows = roles
      .map((row) => {
        const local = row.email.split('@')[0] || ''
        const fallbackName = local
          .split(/[._-]+/)
          .filter(Boolean)
          .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
          .join(' ')
        const name = row.display_name?.trim() || fallbackName

        return {
          email: row.email,
          name,
          search: `${row.email} ${name}`.toLowerCase(),
        }
      })
      .sort((a, b) => a.email.localeCompare(b.email))

    if (!query) return rows.slice(0, 8)
    return rows.filter((row) => row.search.includes(query)).slice(0, 8)
  }, [roles, formEmail])

  const loadRoles = async () => {
    const res = await authedFetch('/api/admin/roles')
    const json = await res.json()
    if (!res.ok) { setError(json.error || 'Failed to load members'); return }
    setRoles(json.roles || [])
    setRequesterEmail(json.requester?.email || '')
    setRequestSource(json.requester?.source || '')
    setRequesterRole((json.requester?.role as OrgRole) || 'user')
    setRequesterPermissions(json.requester?.permissions || [])
  }

  const loadPermissions = async () => {
    const res = await authedFetch('/api/admin/permissions')
    const json = await res.json()
    if (!res.ok) { setError(json.error || 'Failed to load permissions'); return }
    setPermissionMatrix(json.matrix || [])
  }

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await Promise.all([loadRoles(), loadPermissions()])
      setLoading(false)
    })()
  }, [])

  const submitRole = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setSubmitSuccess(false)
    const res = await authedFetch('/api/admin/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetEmail: formEmail,
        role: formRole,
        banReason: formRole === 'banned' ? banReason.trim() || null : null,
        bannedUntil: formRole === 'banned' && bannedUntil ? new Date(bannedUntil).toISOString() : null,
      }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error || 'Failed to update role'); setSubmitting(false); return }
    setFormEmail('')
    setFormRole('manager')
    setBanReason('')
    setBannedUntil('')
    setSubmitSuccess(true)
    setTimeout(() => setSubmitSuccess(false), 3000)
    await loadRoles()
    setSubmitting(false)
  }

  const togglePermission = async (role: OrgRole, permissionKey: string, enabled: boolean) => {
    if (!canManagePerms) return
    setPermSavingKey(`${role}:${permissionKey}`)
    setError('')
    const res = await authedFetch('/api/admin/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, permissionKey, enabled }),
    })
    const json = await res.json()
    if (!res.ok) setError(json.error || 'Failed to update permission')
    else await loadPermissions()
    setPermSavingKey('')
  }

  // Permissions for the currently selected role tab
  const activeRoleField = `${activePermRole}_enabled` as keyof PermissionRow

  return (
    <div className="min-h-screen px-4 py-12 text-zinc-100">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <header className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Admin / Users</p>
              <h1 className="mt-1.5 text-3xl font-black text-zinc-50">Users & Permissions</h1>
            </div>
            <div className="flex gap-2">
              <Link
                to="/admin"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300/30 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-100"
              >
                <ArrowLeft size={14} /> Admin
              </Link>
              <Link
                to="/dashboard"
                className="rounded-lg border border-zinc-300/30 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-100"
              >
                Dashboard
              </Link>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-zinc-700 px-2.5 py-1 text-zinc-400">
              {requesterEmail || 'Loading…'}
            </span>
            <span className={`rounded-full border px-2.5 py-1 ${isLocalSuperadmin ? 'border-orange-300/60 text-orange-200' : 'border-zinc-700 text-zinc-400'}`}>
              {isLocalSuperadmin ? 'Localhost superadmin' : formatRoleLabel(requesterRole)}
            </span>
          </div>
        </header>

        {error ? (
          <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>
        ) : null}

        {/* Two-column: form + member list */}
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">

          {/* Assign role form */}
          <section className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5">
            <div className="mb-4 flex items-center gap-2">
              <UserCog size={16} className="text-orange-300" />
              <h2 className="font-bold text-zinc-100">Assign Role</h2>
            </div>

            <form onSubmit={submitRole} className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-zinc-400">Member (search by name or email)</span>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={formEmail}
                    onChange={(e) => {
                      setFormEmail(e.target.value)
                      setMemberSearchOpen(true)
                    }}
                    onFocus={() => setMemberSearchOpen(true)}
                    onBlur={() => {
                      setTimeout(() => setMemberSearchOpen(false), 120)
                    }}
                    className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-300/60"
                    placeholder="Type a name or email"
                    autoComplete="off"
                  />

                  {memberSearchOpen && memberSuggestions.length > 0 ? (
                    <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950/95 p-1 shadow-xl backdrop-blur">
                      {memberSuggestions.map((member) => (
                        <li key={member.email}>
                          <button
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault()
                              setFormEmail(member.email)
                              setMemberSearchOpen(false)
                            }}
                            className="w-full rounded-md px-2.5 py-2 text-left transition hover:bg-zinc-800"
                          >
                            <p className="truncate text-sm font-medium text-zinc-100">{member.name || member.email}</p>
                            <p className="truncate text-xs text-zinc-500">{member.email}</p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-zinc-400">Role</span>
                <div className="relative">
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as OrgRole)}
                    className="w-full appearance-none rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 pr-8 text-sm text-zinc-100 outline-none transition focus:border-orange-300/60"
                  >
                    {ORG_ROLES.map((r) => (
                      <option key={r} value={r}>{ORG_ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                </div>
              </label>

              {formRole === 'banned' ? (
                <>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-zinc-400">Ban Reason</span>
                    <textarea
                      required
                      value={banReason}
                      onChange={(e) => setBanReason(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-300/60"
                      placeholder="Reason for the ban"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-zinc-400">Ban Until (optional)</span>
                    <input
                      type="datetime-local"
                      value={bannedUntil}
                      onChange={(e) => setBannedUntil(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-300/60"
                    />
                  </label>
                </>
              ) : null}

              <button
                type="submit"
                disabled={submitting || !canManageUsers}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Saving…' : submitSuccess ? <><Check size={14} /> Saved</> : 'Save Role'}
              </button>
            </form>
          </section>

          {/* Member list */}
          <section className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-orange-300" />
                <h2 className="font-bold text-zinc-100">Members</h2>
              </div>
              <span className="rounded-full border border-zinc-700 px-2.5 py-0.5 text-xs text-zinc-500">
                {roles.length} total
              </span>
            </div>

            {loading ? (
              <p className="text-sm text-zinc-400">Loading members…</p>
            ) : roles.length === 0 ? (
              <p className="text-sm text-zinc-500">No members yet.</p>
            ) : (
              <ul className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
                {roles.map((row) => (
                  <li
                    key={row.email}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-zinc-200/10 bg-zinc-950/40 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-100">{row.display_name || row.email}</p>
                      {row.display_name ? <p className="mt-0.5 truncate text-xs text-zinc-500">{row.email}</p> : null}
                      {row.role === 'banned' && row.ban_reason ? (
                        <p className="mt-0.5 text-xs text-rose-300/80">Banned: {row.ban_reason}</p>
                      ) : (
                        <p className="mt-0.5 text-xs text-zinc-600">
                          Granted by {row.granted_by || 'system'} · {new Date(row.updated_at).toLocaleDateString()}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-zinc-500">
                        Plan: {(row.membership_plan || 'free').toUpperCase()} · Permissions: {row.effective_permissions?.length || 0}
                        {row.stripe_subscription_id ? ' · Stripe active' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${roleBadgeClass[row.role]}`}>
                        {row.role === 'banned' ? <span className="flex items-center gap-1"><Ban size={10} />{ORG_ROLE_LABELS[row.role]}</span> : ORG_ROLE_LABELS[row.role]}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Permission management */}
        <section className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-orange-300" />
              <h2 className="font-bold text-zinc-100">Permission Management</h2>
            </div>
            {!canManagePerms ? (
              <span className="rounded-full border border-zinc-700 px-2.5 py-0.5 text-xs text-zinc-500">Read-only</span>
            ) : null}
          </div>

          {/* Role tab selector */}
          <div className="mb-5 flex flex-wrap gap-1.5">
            {PERMISSION_ROLES.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setActivePermRole(role)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  activePermRole === role
                    ? `${roleBadgeClass[role]} ring-1 ring-current/30`
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                }`}
              >
                {ORG_ROLE_LABELS[role]}
              </button>
            ))}
          </div>

          {/* Permission toggle list for active role */}
          {loading ? (
            <p className="text-sm text-zinc-400">Loading permissions…</p>
          ) : (
            <ul className="divide-y divide-zinc-200/8">
              {permissionMatrix.map((perm) => {
                const isEnabled = Boolean(perm[activeRoleField])
                const isSaving = permSavingKey === `${activePermRole}:${perm.permission_key}`
                const isLocked = !canManagePerms || activePermRole === 'banned'

                return (
                  <li key={perm.permission_key} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-100">{perm.label}</p>
                      <p className="text-xs text-zinc-500">{perm.description}</p>
                    </div>
                    <button
                      type="button"
                      disabled={isLocked || isSaving}
                      onClick={() => { void togglePermission(activePermRole, perm.permission_key, !isEnabled) }}
                      className={`relative shrink-0 h-6 w-11 rounded-full border transition-colors duration-200 ${
                        isEnabled
                          ? 'border-orange-400/60 bg-orange-400/20'
                          : 'border-zinc-600 bg-zinc-800'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                      aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${perm.label} for ${ORG_ROLE_LABELS[activePermRole]}`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full transition-all duration-200 ${
                          isEnabled
                            ? 'left-[calc(100%-18px)] bg-orange-300'
                            : 'left-0.5 bg-zinc-500'
                        }`}
                      />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
