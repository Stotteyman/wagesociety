import type { AuthUserLike } from './memberDirectory'

type OrgAuthUserIndexRow = {
  user_id: string
  email: string | null
  user_metadata: Record<string, unknown> | null
  created_at: string | null
  updated_at: string | null
}

type AuthListUserRow = {
  id?: string
  email?: string | null
  created_at?: string
  updated_at?: string
  user_metadata?: Record<string, unknown> | null
}

type MinimalAuthClient = {
  rpc?: (fn: string) => unknown
  from?: (table: string) => {
    select: (columns: string) => {
      order: (column: string, options?: { ascending?: boolean }) => {
        limit: (value: number) => Promise<{ data?: unknown; error?: unknown }>
      }
    }
  }
  auth?: {
    admin?: {
      listUsers?: (options: { page: number; perPage: number }) => Promise<{
        data?: { users?: AuthListUserRow[] }
        error?: unknown
      }>
    }
  }
}

function normalizeEmail(value: unknown) {
  const trimmed = String(value || '').trim().toLowerCase()
  return trimmed || null
}

function normalizeDateOrNow(value: unknown) {
  const str = String(value || '').trim()
  return str || new Date().toISOString()
}

function normalizeRows(data: unknown): AuthUserLike[] {
  const rows = Array.isArray(data) ? (data as OrgAuthUserIndexRow[]) : []
  return rows
    .filter((row) => Boolean(row.user_id))
    .map((row) => ({
      id: row.user_id,
      email: normalizeEmail(row.email),
      user_metadata: row.user_metadata || null,
      created_at: normalizeDateOrNow(row.created_at),
      updated_at: normalizeDateOrNow(row.updated_at || row.created_at),
      identities: null,
    }))
}

async function listDirectAuthUsers(client: MinimalAuthClient) {
  const listUsers = client.auth?.admin?.listUsers
  if (!listUsers) return [] as AuthUserLike[]

  const collected: AuthUserLike[] = []
  let page = 1
  const perPage = 1000

  while (page <= 10) {
    const { data, error } = await listUsers({ page, perPage })
    if (error) break

    const pageUsers = Array.isArray(data?.users) ? data.users : []
    if (!pageUsers.length) break

    for (const row of pageUsers) {
      const id = String(row.id || '').trim()
      if (!id) continue

      const createdAt = normalizeDateOrNow(row.created_at)
      const updatedAt = normalizeDateOrNow(row.updated_at || row.created_at)

      collected.push({
        id,
        email: normalizeEmail(row.email),
        user_metadata: row.user_metadata || null,
        created_at: createdAt,
        updated_at: updatedAt,
        identities: null,
      })
    }

    if (pageUsers.length < perPage) break
    page += 1
  }

  return collected
}

function mergeUsers(sources: AuthUserLike[][]) {
  const byKey = new Map<string, AuthUserLike>()

  for (const source of sources) {
    for (const user of source) {
      const id = String(user.id || '').trim()
      const email = normalizeEmail(user.email)
      const key = id || email
      if (!key) continue

      const existing = byKey.get(key)
      if (!existing) {
        byKey.set(key, {
          id: id || key,
          email,
          user_metadata: user.user_metadata || null,
          created_at: normalizeDateOrNow(user.created_at),
          updated_at: normalizeDateOrNow(user.updated_at || user.created_at),
          identities: null,
        })
        continue
      }

      byKey.set(key, {
        ...existing,
        id: id || existing.id,
        email: email || existing.email || null,
        user_metadata: user.user_metadata || existing.user_metadata || null,
        created_at: normalizeDateOrNow(existing.created_at || user.created_at),
        updated_at: normalizeDateOrNow(user.updated_at || existing.updated_at || user.created_at),
        identities: null,
      })
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const aCreated = String(a.created_at || '')
    const bCreated = String(b.created_at || '')
    if (aCreated !== bCreated) return aCreated.localeCompare(bCreated)
    return String(a.id || '').localeCompare(String(b.id || ''))
  })
}

export async function listAuthIndexedUsers(client: any, limit = 10000): Promise<AuthUserLike[]> {
  const candidates: AuthUserLike[][] = []

  // Prefer auth-backed RPC for canonical auth.users data when available.
  try {
    const rpcResult = (await Promise.resolve(client.rpc?.('list_auth_users_index'))) as
      | { data?: unknown; error?: unknown }
      | undefined
    if (!rpcResult.error) {
      candidates.push(normalizeRows(rpcResult.data))
    }
  } catch {
    // Fall through to additional sources.
  }

  // Use the synced public index table as an additional source.
  try {
    const { data, error } = await client
      .from?.('org_auth_user_index')
      ?.select('user_id, email, user_metadata, created_at, updated_at')
      ?.order('created_at', { ascending: true })
      ?.limit(limit)

    if (!error) {
      candidates.push(normalizeRows(data))
    }
  } catch {
    // Fall through to direct admin source.
  }

  // If this is a service-role client, merge direct auth.admin users too.
  try {
    const directUsers = await listDirectAuthUsers(client)
    if (directUsers.length > 0) {
      candidates.push(directUsers)
    }
  } catch {
    // Ignore direct-auth failures and return best available merged data.
  }

  if (candidates.length === 0) {
    return []
  }

  const merged = mergeUsers(candidates)
  if (merged.length <= limit) {
    return merged
  }

  return merged.slice(0, limit)
}
