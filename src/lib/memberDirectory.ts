type AuthUserMetadata = {
  username?: string
  preferred_username?: string
  full_name?: string
  name?: string
  avatar_url?: string
  picture?: string
}

export type AuthUserLike = {
  id: string
  email?: string | null
  created_at?: string | null
  updated_at?: string | null
  user_metadata?: AuthUserMetadata | null
  identities?: Array<unknown> | null
}

export function normalizeMemberUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function readUsernameFromMetadata(meta: AuthUserMetadata | null | undefined) {
  const candidates = [meta?.username, meta?.preferred_username]
  for (const candidate of candidates) {
    const normalized = normalizeMemberUsername(candidate || '')
    if (normalized) return normalized
  }
  return null
}

export function readDisplayNameFromMetadata(meta: AuthUserMetadata | null | undefined) {
  const candidates = [meta?.full_name, meta?.name]
  for (const candidate of candidates) {
    const trimmed = candidate?.trim()
    if (trimmed) return trimmed
  }
  return null
}

export function readAvatarFromMetadata(meta: AuthUserMetadata | null | undefined) {
  const candidates = [meta?.avatar_url, meta?.picture]
  for (const candidate of candidates) {
    const trimmed = candidate?.trim()
    if (trimmed) return trimmed
  }
  return null
}

export function makeBaseUsername(user: AuthUserLike) {
  const fromMeta = readUsernameFromMetadata(user.user_metadata)
  if (fromMeta) return fromMeta

  const emailLocal = String(user.email || '')
    .toLowerCase()
    .trim()
    .split('@')[0]

  const fromEmail = normalizeMemberUsername(emailLocal)
  if (fromEmail) return fromEmail

  return `member-${String(user.id || '').slice(0, 8)}`
}

export function assignDeterministicUsernames(users: AuthUserLike[]) {
  const sorted = [...users].sort((a, b) => {
    const aCreated = a.created_at || ''
    const bCreated = b.created_at || ''
    if (aCreated !== bCreated) return aCreated.localeCompare(bCreated)
    return String(a.id || '').localeCompare(String(b.id || ''))
  })

  const taken = new Set<string>()
  const result = new Map<string, string>()

  for (const user of sorted) {
    const base = makeBaseUsername(user)
    let candidate = base

    if (taken.has(candidate)) {
      const shortId = String(user.id || '').slice(0, 6).toLowerCase()
      candidate = normalizeMemberUsername(`${base}-${shortId}`) || `${base}-member`
      let i = 2
      while (taken.has(candidate)) {
        candidate = `${base}-${shortId}-${i}`
        i += 1
      }
    }

    taken.add(candidate)
    result.set(String(user.id), candidate)
  }

  return result
}
