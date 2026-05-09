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
import { resolveRequester } from '../../../lib/orgAuth'
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../../lib/supabaseAdmin'
import { getSupabaseServerClientForToken, getSupabaseServerPublicClient } from '../../../lib/supabaseServer'

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/

const updateSchema = z.object({
  displayName: z.string().trim().max(20).optional(),
  avatarUrl: z.string().url().optional().or(z.literal('')),
  bio: z.string().trim().max(500).optional(),
  skills: z.array(z.string().trim().max(40)).max(30).optional(),
  selectedYouTubeChannel: z.string().trim().max(200).nullable().optional(),
  connectedKickUsername: z.string().trim().max(120).nullable().optional(),
})

type AuthUserMeta = {
  username?: string
  preferred_username?: string
  livestream_links?: string[]
  selected_youtube_channel?: string
  kick_username?: string
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

type StreamAccountOption = {
  key: string
  label: string
  url: string
}

type StreamAccounts = {
  kick: {
    connected: boolean
    username: string | null
    url: string | null
  }
  youtube: {
    connected: boolean
    selected: string | null
    options: StreamAccountOption[]
  }
}

type AuthIdentityRow = {
  provider?: string | null
  identity_data?: Record<string, unknown> | null
}

type CustomOAuthProviderRow = {
  identifier?: string | null
  name?: string | null
  enabled?: boolean | null
}

const BUILTIN_OAUTH_PROVIDER_META: Record<string, { label: string; description: string }> = {
  discord: { label: 'Discord', description: 'Link your Discord account' },
  google: { label: 'Google / YouTube', description: 'Link your Google account' },
  kick: { label: 'Kick', description: 'Link your Kick account' },
  'custom:kick': { label: 'Kick', description: 'Link your Kick account' },
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

async function getAvailableOAuthProviders(client: any, includeIdentityProviderScan: boolean) {
  const identityPromise = includeIdentityProviderScan
    ? client
      .schema('auth')
      .from('identities')
      .select('provider')
      .neq('provider', 'email')
    : Promise.resolve({ data: null, error: null })

  const [{ data: identityRows, error: identityError }, { data: customRows, error: customError }] = await Promise.all([
    identityPromise,
    client
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

function normalizeYouTubeSelection(raw: string | null | undefined) {
  const value = String(raw || '').trim()
  if (!value) return null

  if (value.startsWith('handle:') || value.startsWith('channel:') || value.startsWith('user:') || value.startsWith('custom:')) {
    return value
  }

  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    if (host.includes('youtube.com') || host === 'youtu.be') {
      const segments = url.pathname.split('/').filter(Boolean)
      if (segments[0]?.startsWith('@')) {
        return `handle:${segments[0].slice(1).toLowerCase()}`
      }
      if (segments[0] === 'channel' && segments[1]) return `channel:${segments[1]}`
      if (segments[0] === 'user' && segments[1]) return `user:${segments[1]}`
      if (segments[0] === 'c' && segments[1]) return `custom:${segments[1]}`
    }
  } catch {
    // Ignore parse errors and fail validation below.
  }

  return null
}

function streamKeyToYouTubeUrl(key: string) {
  if (key.startsWith('handle:')) return `https://www.youtube.com/@${key.slice('handle:'.length)}`
  if (key.startsWith('channel:')) return `https://www.youtube.com/channel/${key.slice('channel:'.length)}`
  if (key.startsWith('user:')) return `https://www.youtube.com/user/${key.slice('user:'.length)}`
  if (key.startsWith('custom:')) return `https://www.youtube.com/c/${key.slice('custom:'.length)}`
  return key
}

function buildYouTubeOptions(meta: AuthUserMeta | null | undefined, authUser: any | null | undefined) {
  const options = new Map<string, StreamAccountOption>()

  const selected = normalizeYouTubeSelection(meta?.selected_youtube_channel)
  if (selected) {
    options.set(selected, {
      key: selected,
      label: `Selected channel (${selected})`,
      url: streamKeyToYouTubeUrl(selected),
    })
  }

  const identities = Array.isArray(authUser?.identities) ? authUser.identities : []
  const googleIdentity = identities.find((identity: any) => String(identity?.provider || '').toLowerCase() === 'google')
  const googleData = (googleIdentity?.identity_data as Record<string, unknown> | undefined) || {}

  const candidates = new Set<string>()
  const metaUsername = String(meta?.username || meta?.preferred_username || '').trim().replace(/^@/, '')
  if (metaUsername) candidates.add(metaUsername)

  const googleEmail = String(googleData.email || '').trim().toLowerCase()
  const emailPrefix = googleEmail.split('@')[0]?.replace(/^@/, '')
  if (emailPrefix) candidates.add(emailPrefix)

  const fullName = String(googleData.full_name || googleData.name || '').trim()
  if (fullName) {
    const compact = fullName.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (compact.length >= 3) candidates.add(compact)
  }

  for (const candidate of candidates) {
    const key = `handle:${candidate.toLowerCase()}`
    if (!options.has(key)) {
      options.set(key, {
        key,
        label: `@${candidate}`,
        url: streamKeyToYouTubeUrl(key),
      })
    }
  }

  return Array.from(options.values())
}

function buildConnectedStreamAccounts(meta: AuthUserMeta | null | undefined, authUser: any | null | undefined): StreamAccounts {
  const identities = Array.isArray(authUser?.identities) ? authUser.identities : []
  const kickIdentity = identities.find((identity: any) => {
    const provider = String(identity?.provider || '').trim().toLowerCase()
    return provider === 'kick' || provider === 'custom:kick'
  })
  const googleIdentity = identities.find((identity: any) => String(identity?.provider || '').trim().toLowerCase() === 'google')

  const kickData = (kickIdentity?.identity_data as Record<string, unknown> | undefined) || {}
  const kickUsernameCandidates = [
    meta?.kick_username,
    kickData.preferred_username,
    kickData.username,
    kickData.login,
  ]

  let kickUsername: string | null = null
  for (const candidate of kickUsernameCandidates) {
    const normalized = String(candidate || '').trim().replace(/^@/, '')
    if (normalized) {
      kickUsername = normalized
      break
    }
  }

  const selected = normalizeYouTubeSelection(meta?.selected_youtube_channel)
  const youtubeOptions = buildYouTubeOptions(meta, authUser)

  return {
    kick: {
      connected: Boolean(kickIdentity),
      username: kickUsername,
      url: kickUsername ? `https://kick.com/${kickUsername}` : null,
    },
    youtube: {
      connected: Boolean(googleIdentity),
      selected,
      options: youtubeOptions,
    },
  }
}

export const Route = createFileRoute('/api/me/profile')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const requester = await resolveRequester(request)
          const canUseAdmin = hasSupabaseAdminConfig()
          const token = getBearerToken(request)
          const client = canUseAdmin
            ? getSupabaseAdminClient()
            : token
              ? getSupabaseServerClientForToken(token)
              : getSupabaseServerPublicClient()

          const profilePromise = (client as any)
              .from('org_member_profiles')
              .select('email, display_name, avatar_url, bio, skills, updated_at')
              .eq('email', requester.email)
              .maybeSingle()

          const authUserPromise = canUseAdmin
            ? (getSupabaseAdminClient() as any)
              .schema('auth')
              .from('users')
              .select('id, raw_user_meta_data')
              .eq('email', requester.email)
              .maybeSingle()
            : token
              ? (getSupabaseServerClientForToken(token) as any).auth.getUser(token)
              : Promise.resolve({ data: { user: null }, error: null })

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

          const oauthProviders = await getAvailableOAuthProviders(client as any, canUseAdmin)

          const authUserRecord = canUseAdmin ? authUser : authUser?.user

          if (canUseAdmin && authUserRecord?.id) {
            const { data: identityRows, error: identityError } = await (getSupabaseAdminClient() as any)
              .schema('auth')
              .from('identities')
              .select('provider, identity_data')
              .eq('user_id', authUserRecord.id)

            if (identityError) {
              return Response.json({ error: identityError.message }, { status: 500 })
            }

            authUserRecord.identities = Array.isArray(identityRows) ? identityRows : []
          }

          const meta = (authUserRecord?.raw_user_meta_data as AuthUserMeta | null | undefined)
            ?? (authUserRecord?.user_metadata as AuthUserMeta | null | undefined)
            ?? null
          const streamAccounts = buildConnectedStreamAccounts(meta, authUserRecord)
          const authDisplayName = readDisplayNameFromMeta(meta)

          return Response.json({
            oauth_providers: oauthProviders,
            stream_accounts: streamAccounts,
            profile: profile
              ? {
                  ...profile,
                  display_name: profile.display_name || authDisplayName,
                  livestream_links: [
                    ...(streamAccounts.kick.url ? [streamAccounts.kick.url] : []),
                    ...(streamAccounts.youtube.selected ? [streamKeyToYouTubeUrl(streamAccounts.youtube.selected)] : []),
                  ],
                }
              : {
                  ...createFallbackProfile(requester.email, authDisplayName),
                  livestream_links: [
                    ...(streamAccounts.kick.url ? [streamAccounts.kick.url] : []),
                    ...(streamAccounts.youtube.selected ? [streamKeyToYouTubeUrl(streamAccounts.youtube.selected)] : []),
                  ],
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
          const requester = await resolveRequester(request)
          const body = await request.json()
          const parsed = updateSchema.safeParse(body)
          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          const selectedYouTubeChannel = parsed.data.selectedYouTubeChannel !== undefined
            ? normalizeYouTubeSelection(parsed.data.selectedYouTubeChannel)
            : undefined

          if (parsed.data.selectedYouTubeChannel !== undefined && parsed.data.selectedYouTubeChannel !== null && !selectedYouTubeChannel) {
            return Response.json({ error: 'Invalid YouTube channel selection.' }, { status: 400 })
          }

          const connectedKickUsername = parsed.data.connectedKickUsername !== undefined
            ? String(parsed.data.connectedKickUsername || '').trim().replace(/^@/, '') || null
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
                .neq('email', requester.email)
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
                  if (!rowEmail || rowEmail === requester.email) return false
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
            (userRow) => String(userRow.email || '').toLowerCase() === requester.email,
          )

          if (canUseAdmin && currentAuthUser?.id && (parsed.data.displayName !== undefined || selectedYouTubeChannel !== undefined || connectedKickUsername !== undefined)) {
            const existingMeta = (currentAuthUser.raw_user_meta_data as AuthUserMeta | null | undefined) ?? {}
            const trimmedDisplayName = parsed.data.displayName?.trim() || ''
            const nextName = trimmedDisplayName || readDisplayNameFromMeta(existingMeta) || ''

            const { error: updateAuthError } = await getSupabaseAdminClient().auth.admin.updateUserById(currentAuthUser.id, {
              user_metadata: {
                ...existingMeta,
                username: nextName,
                preferred_username: nextName,
                selected_youtube_channel:
                  selectedYouTubeChannel !== undefined
                    ? selectedYouTubeChannel
                    : (existingMeta.selected_youtube_channel || null),
                kick_username:
                  connectedKickUsername !== undefined
                    ? connectedKickUsername
                    : (existingMeta.kick_username || null),
              },
            })

            if (updateAuthError) {
              return Response.json({ error: updateAuthError.message }, { status: 500 })
            }
          }

          if (!canUseAdmin && token && (parsed.data.displayName !== undefined || selectedYouTubeChannel !== undefined || connectedKickUsername !== undefined)) {
            const userClient = getSupabaseServerClientForToken(token)
            const {
              data: { user: tokenUser },
              error: tokenUserError,
            } = await userClient.auth.getUser(token)

            if (tokenUserError || !tokenUser?.email) {
              return Response.json({ error: tokenUserError?.message || 'Could not resolve current user' }, { status: 401 })
            }

            if (String(tokenUser.email).trim().toLowerCase() !== requester.email) {
              return Response.json({ error: 'Metadata update email mismatch' }, { status: 403 })
            }

            const existingMeta = ((tokenUser.user_metadata as AuthUserMeta | null | undefined) ?? {})
            const trimmedDisplayName = parsed.data.displayName?.trim() || ''
            const nextName = trimmedDisplayName || readDisplayNameFromMeta(existingMeta) || ''

            const { error: updateAuthError } = await userClient.auth.updateUser({
              data: {
                ...existingMeta,
                username: nextName,
                preferred_username: nextName,
                selected_youtube_channel:
                  selectedYouTubeChannel !== undefined
                    ? selectedYouTubeChannel
                    : (existingMeta.selected_youtube_channel || null),
                kick_username:
                  connectedKickUsername !== undefined
                    ? connectedKickUsername
                    : (existingMeta.kick_username || null),
              },
            })

            if (updateAuthError) {
              return Response.json({ error: updateAuthError.message }, { status: 500 })
            }
          }

          const payload: Record<string, unknown> = {
            email: requester.email,
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

          // Save livestream selection to database if YouTube channel is selected
          if (selectedYouTubeChannel) {
            const youtubeUrl = streamKeyToYouTubeUrl(selectedYouTubeChannel)
            const displayName = data?.display_name || parsed.data.displayName?.trim() || requester.email.split('@')[0]
            const avatarUrl = data?.avatar_url || parsed.data.avatarUrl || null

            const { error: livestreamError } = await (client as any)
              .from('org_member_livestreams')
              .upsert(
                {
                  email: requester.email,
                  platform: 'youtube',
                  stream_key: selectedYouTubeChannel,
                  stream_url: youtubeUrl,
                  display_name: displayName,
                  avatar_url: avatarUrl,
                },
                { onConflict: 'email' }
              )

            if (livestreamError && livestreamError.code !== '42P01') {
              console.error('Failed to save livestream selection:', livestreamError)
              // Don't fail the whole request if livestream save fails
            }
          } else if (selectedYouTubeChannel === null) {
            // Delete livestream entry if explicitly set to null
            const { error: deleteError } = await (client as any)
              .from('org_member_livestreams')
              .delete()
              .eq('email', requester.email)
              .eq('platform', 'youtube')

            if (deleteError) {
              console.error('Failed to delete livestream selection:', deleteError)
            }
          }

          if (data) {
            const ownAuthMeta = (currentAuthUser?.raw_user_meta_data as AuthUserMeta | null | undefined) ?? null
            const streamAccounts = buildConnectedStreamAccounts(ownAuthMeta, null)
            return Response.json({
              profile: {
                ...data,
                livestream_links: [
                  ...(streamAccounts.kick.url ? [streamAccounts.kick.url] : []),
                  ...(streamAccounts.youtube.selected ? [streamKeyToYouTubeUrl(streamAccounts.youtube.selected)] : []),
                ],
              },
            })
          }

          const ownAuthMeta = (currentAuthUser?.raw_user_meta_data as AuthUserMeta | null | undefined) ?? null
          const fallbackDisplayName =
            parsed.data.displayName?.trim() || readDisplayNameFromMeta(ownAuthMeta)

          return Response.json({
            profile: {
              ...createFallbackProfile(requester.email, fallbackDisplayName || null),
              livestream_links: [
                ...(ownAuthMeta?.kick_username ? [`https://kick.com/${String(ownAuthMeta.kick_username).replace(/^@/, '')}`] : []),
                ...(ownAuthMeta?.selected_youtube_channel
                  ? [streamKeyToYouTubeUrl(String(ownAuthMeta.selected_youtube_channel))]
                  : []),
              ],
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
