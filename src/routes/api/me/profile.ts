/**
 * Member profile API
 *
 * Required Supabase table (run in SQL editor):
 *
 * create table if not exists org_member_profiles (
 *   email text primary key,
 *   display_name text check (char_length(display_name) <= 80),
 *   avatar_url text,
 *   bio text check (char_length(bio) <= 500),
 *   skills text[] not null default '{}',
 *   updated_at timestamptz not null default now(),
 *   username_changed_at timestamptz
 * );
 *
 * -- If table already exists, add the column:
 * -- ALTER TABLE org_member_profiles ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;
 */

import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requirePermission } from '../../../lib/orgAuth'
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../../lib/supabaseAdmin'
import { getSupabaseServerClientForToken } from '../../../lib/supabaseServer'

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/

const updateSchema = z.object({
  displayName: z.string().trim().max(20).optional(),
  avatarUrl: z.string().url().optional().or(z.literal('')),
  bio: z.string().trim().max(500).optional(),
  skills: z.array(z.string().trim().max(40)).max(30).optional(),
  livestreamLinks: z.array(z.string().url()).max(20).optional(),
})

type AuthUserMeta = {
  username?: string
  preferred_username?: string
  livestream_links?: string[]
}

function readDisplayNameFromMeta(meta: AuthUserMeta | null | undefined) {
  const candidates = [meta?.username, meta?.preferred_username]
  for (const candidate of candidates) {
    const trimmed = candidate?.trim()
    if (trimmed) return trimmed
  }
  return null
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get('authorization') || ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) return undefined
  const token = authHeader.slice(7).trim()
  return token || undefined
}

function createFallbackProfile(email: string, displayName: string | null) {
  return {
    email,
    display_name: displayName,
    avatar_url: null,
    bio: null,
    skills: [] as string[],
    livestream_links: [] as string[],
    updated_at: null,
  }
}

type ProfileRow = {
  email: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  skills: string[] | null
  livestream_links?: string[] | null
  updated_at: string | null
}

type OAuthProviderOption = {
  key: string
  label: string
  description: string
}

type AuthIdentityRow = {
  provider?: string | null
}

type CustomOAuthProviderRow = {
  identifier?: string | null
  name?: string | null
  enabled?: boolean | null
}

const BUILTIN_OAUTH_PROVIDER_META: Record<string, { label: string; description: string }> = {
  discord: { label: 'Discord', description: 'Link your Discord account' },
  google: { label: 'Google / YouTube', description: 'Link your Google account' },
  apple: { label: 'Apple', description: 'Link your Apple account' },
  facebook: { label: 'Facebook', description: 'Link your Facebook account' },
}

function toTitleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ')
}

function providerOptionFromKey(key: string, explicitLabel?: string | null): OAuthProviderOption {
  const normalized = key.trim().toLowerCase()
  const builtin = BUILTIN_OAUTH_PROVIDER_META[normalized]
  if (builtin) {
    return { key: normalized, label: builtin.label, description: builtin.description }
  }

  const customName = normalized.startsWith('custom:') ? normalized.slice('custom:'.length) : normalized
  const label = (explicitLabel || '').trim() || toTitleCase(customName) || normalized
  return {
    key: normalized,
    label,
    description: `Link your ${label} account`,
  }
}

async function getAvailableOAuthProviders() {
  if (!hasSupabaseAdminConfig()) {
    return [] as OAuthProviderOption[]
  }

  const admin = getSupabaseAdminClient() as any

  const [{ data: identityRows, error: identityError }, { data: customRows, error: customError }] = await Promise.all([
    admin
      .schema('auth')
      .from('identities')
      .select('provider')
      .neq('provider', 'email'),
    admin
      .schema('auth')
      .from('custom_oauth_providers')
      .select('identifier, name, enabled')
      .eq('enabled', true),
  ])

  const optionsByKey = new Map<string, OAuthProviderOption>()

  if (!identityError) {
    for (const row of (identityRows as AuthIdentityRow[] | null) ?? []) {
      const provider = String(row.provider || '').trim().toLowerCase()
      if (!provider) continue
      optionsByKey.set(provider, providerOptionFromKey(provider))
    }
  }

  if (!customError) {
    for (const row of (customRows as CustomOAuthProviderRow[] | null) ?? []) {
      if (row.enabled === false) continue
      const identifier = String(row.identifier || '').trim().toLowerCase()
      if (!identifier) continue
      optionsByKey.set(identifier, providerOptionFromKey(identifier, row.name))
    }
  }

  return Array.from(optionsByKey.values()).sort((a, b) => a.label.localeCompare(b.label))
}

function readLivestreamLinks(meta: AuthUserMeta | null | undefined) {
  const raw = Array.isArray(meta?.livestream_links) ? meta?.livestream_links : []
  const unique = new Set<string>()
  for (const value of raw) {
    const trimmed = String(value || '').trim()
    if (trimmed) unique.add(trimmed)
  }
  return Array.from(unique)
}

export const Route = createFileRoute('/api/me/profile')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const access = await requirePermission(request, 'view_dashboard')
          const canUseAdmin = hasSupabaseAdminConfig()
          const token = getBearerToken(request)
          const client = canUseAdmin ? getSupabaseAdminClient() : getSupabaseServerClientForToken(token)

          const profilePromise = (client as any)
              .from('org_member_profiles')
              .select('email, display_name, avatar_url, bio, skills, updated_at')
              .eq('email', access.requester.email)
              .maybeSingle()

          const authUserPromise = canUseAdmin
            ? (getSupabaseAdminClient() as any)
              .schema('auth')
              .from('users')
              .select('raw_user_meta_data')
              .eq('email', access.requester.email)
              .maybeSingle()
            : Promise.resolve({ data: null, error: null })

          const [{ data: profileRaw, error: profileError }, { data: authUser, error: authUserError }] = await Promise.all([
            profilePromise,
            authUserPromise,
          ])

          const profile = (profileRaw as ProfileRow | null) || null

          if (profileError && profileError.code !== '42P01') {
            return Response.json({ error: profileError.message }, { status: 500 })
          }

          if (authUserError) {
            return Response.json({ error: authUserError.message }, { status: 500 })
          }

          const oauthProviders = await getAvailableOAuthProviders()

          const meta = (authUser?.raw_user_meta_data as AuthUserMeta | null | undefined) ?? null
          const authDisplayName = readDisplayNameFromMeta(meta)

          return Response.json({
            oauth_providers: oauthProviders,
            profile: profile
              ? {
                  ...profile,
                  display_name: profile.display_name || authDisplayName,
                  livestream_links: readLivestreamLinks(meta),
                }
              : {
                  ...createFallbackProfile(access.requester.email, authDisplayName),
                  livestream_links: readLivestreamLinks(meta),
                },
          })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json(
            { error: error instanceof Error ? error.message : 'Unexpected server error' },
            { status: 500 },
          )
        }
      },

      PUT: async ({ request }) => {
        try {
          const access = await requirePermission(request, 'view_dashboard')
          const body = await request.json()
          const parsed = updateSchema.safeParse(body)
          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          const normalizedLivestreamLinks =
            parsed.data.livestreamLinks !== undefined
              ? Array.from(new Set(parsed.data.livestreamLinks.map((link) => link.trim()).filter(Boolean)))
              : undefined

          const canUseAdmin = hasSupabaseAdminConfig()
          const token = getBearerToken(request)
          const client = canUseAdmin ? getSupabaseAdminClient() : getSupabaseServerClientForToken(token)

          let authUserList: Array<{ id?: string | null; email?: string | null; raw_user_meta_data?: unknown }> = []

          if (canUseAdmin) {
            const { data: authUsers, error: authUsersError } = await (getSupabaseAdminClient() as any)
              .schema('auth')
              .from('users')
              .select('id, email, raw_user_meta_data')

            if (authUsersError) {
              return Response.json({ error: authUsersError.message }, { status: 500 })
            }

            authUserList = Array.isArray(authUsers) ? authUsers : []
          }

          // Enforce username uniqueness when display_name is being changed.
          if (parsed.data.displayName !== undefined) {
            const newName = parsed.data.displayName.trim()
            if (newName && !USERNAME_REGEX.test(newName)) {
              return Response.json(
                { error: 'Username must be 3–20 characters and contain only letters, numbers, underscores, or hyphens.' },
                { status: 400 },
              )
            }

            if (newName) {
              const { data: existing, error: checkError } = await client
                .from('org_member_profiles')
                .select('email')
                .ilike('display_name', newName)
                .neq('email', access.requester.email)
                .limit(1)

              if (checkError && checkError.code !== '42P01') {
                return Response.json({ error: 'Could not verify username availability.' }, { status: 500 })
              }

              if (Array.isArray(existing) && existing.length > 0) {
                return Response.json({ error: 'That username is already taken. Please choose another.' }, { status: 409 })
              }

              if (canUseAdmin) {
                const normalized = newName.toLowerCase()
                const takenInAuth = authUserList.some((userRow) => {
                  const rowEmail = String(userRow.email || '').toLowerCase()
                  if (!rowEmail || rowEmail === access.requester.email) return false
                  const metadata = (userRow.raw_user_meta_data as AuthUserMeta | null | undefined) ?? null
                  const candidates = [metadata?.username, metadata?.preferred_username]
                  return candidates.some((candidate) => candidate?.trim().toLowerCase() === normalized)
                })

                if (takenInAuth) {
                  return Response.json({ error: 'That username is already taken. Please choose another.' }, { status: 409 })
                }
              }
            }
          }

          const currentAuthUser = authUserList.find(
            (userRow) => String(userRow.email || '').toLowerCase() === access.requester.email,
          )

          if (canUseAdmin && currentAuthUser?.id && (parsed.data.displayName !== undefined || parsed.data.livestreamLinks !== undefined)) {
            const existingMeta = (currentAuthUser.raw_user_meta_data as AuthUserMeta | null | undefined) ?? {}
            const trimmedDisplayName = parsed.data.displayName?.trim() || ''
            const nextName = trimmedDisplayName || readDisplayNameFromMeta(existingMeta) || ''
            const nextLinks =
              normalizedLivestreamLinks !== undefined
                ? normalizedLivestreamLinks
                : readLivestreamLinks(existingMeta)

            const { error: updateAuthError } = await getSupabaseAdminClient().auth.admin.updateUserById(currentAuthUser.id, {
              user_metadata: {
                ...existingMeta,
                username: nextName,
                preferred_username: nextName,
                livestream_links: nextLinks,
              },
            })

            if (updateAuthError) {
              return Response.json({ error: updateAuthError.message }, { status: 500 })
            }
          }

          const payload: Record<string, unknown> = {
            email: access.requester.email,
            updated_at: new Date().toISOString(),
          }

          if (parsed.data.displayName !== undefined) {
            payload.display_name = parsed.data.displayName
          }
          if (parsed.data.avatarUrl !== undefined) payload.avatar_url = parsed.data.avatarUrl || null
          if (parsed.data.bio !== undefined) payload.bio = parsed.data.bio
          if (parsed.data.skills !== undefined) payload.skills = parsed.data.skills

          const { data, error } = await (client as any)
            .from('org_member_profiles')
            .upsert(payload as any, { onConflict: 'email' })
            .select('email, display_name, avatar_url, bio, skills, updated_at')
            .single()

          if (error && error.code !== '42P01') {
            return Response.json({ error: error.message }, { status: 500 })
          }

          if (data) {
            const ownAuthMeta = (currentAuthUser?.raw_user_meta_data as AuthUserMeta | null | undefined) ?? null
            return Response.json({
              profile: {
                ...data,
                livestream_links: normalizedLivestreamLinks ?? readLivestreamLinks(ownAuthMeta),
              },
            })
          }

          const ownAuthMeta = (currentAuthUser?.raw_user_meta_data as AuthUserMeta | null | undefined) ?? null
          const fallbackDisplayName =
            parsed.data.displayName?.trim() || readDisplayNameFromMeta(ownAuthMeta)

          return Response.json({
            profile: {
              ...createFallbackProfile(access.requester.email, fallbackDisplayName || null),
              livestream_links: normalizedLivestreamLinks ?? readLivestreamLinks(ownAuthMeta),
            },
          })
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
