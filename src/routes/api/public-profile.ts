import { createFileRoute } from '@tanstack/react-router'
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin'

type AuthUserMeta = {
  username?: string
  full_name?: string
  name?: string
  preferred_username?: string
  picture?: string
  avatar_url?: string
}

type IdentityRow = {
  provider: string
  identity_data: {
    username?: string
    preferred_username?: string
    user_name?: string
    name?: string
    profile_url?: string
    channel?: string
  } | null
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase()
}

function readUsernameFromMeta(meta: AuthUserMeta | null | undefined) {
  const candidates = [meta?.username, meta?.preferred_username, meta?.full_name, meta?.name]
  for (const candidate of candidates) {
    const trimmed = candidate?.trim()
    if (trimmed) return trimmed
  }
  return null
}

function readAvatarFromMeta(meta: AuthUserMeta | null | undefined) {
  const candidates = [meta?.avatar_url, meta?.picture]
  for (const candidate of candidates) {
    const trimmed = candidate?.trim()
    if (trimmed) return trimmed
  }
  return null
}

function providerLabel(provider: string) {
  switch (provider.toLowerCase()) {
    case 'custom:kick':
      return 'Kick'
    case 'discord':
      return 'Discord'
    case 'google':
      return 'Google'
    case 'facebook':
      return 'Facebook'
    case 'github':
      return 'GitHub'
    case 'twitter':
      return 'X / Twitter'
    case 'twitch':
      return 'Twitch'
    case 'apple':
      return 'Apple'
    default:
      return provider
  }
}

function providerProfileUrl(provider: string, handle: string) {
  const normalizedHandle = handle.replace(/^@/, '')
  switch (provider.toLowerCase()) {
    case 'custom:kick':
      return `https://kick.com/${normalizedHandle}`
    case 'twitter':
      return `https://x.com/${normalizedHandle}`
    case 'twitch':
      return `https://twitch.tv/${normalizedHandle}`
    case 'github':
      return `https://github.com/${normalizedHandle}`
    case 'discord':
      return `https://discord.com/users/${normalizedHandle}`
    case 'facebook':
      return `https://facebook.com/${normalizedHandle}`
    default:
      return null
  }
}

export const Route = createFileRoute('/api/public-profile')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const usernameParam = url.searchParams.get('username') || ''
          const normalizedRequestedUsername = normalizeUsername(usernameParam)

          if (!normalizedRequestedUsername) {
            return Response.json({ error: 'username is required.' }, { status: 400 })
          }

          const admin = getSupabaseAdminClient()
          const { data: users, error: usersError } = await admin
            .schema('auth')
            .from('users')
            .select('id, email, raw_user_meta_data')
            .limit(5000)

          if (usersError) {
            return Response.json({ error: usersError.message }, { status: 500 })
          }

          const authUser = (Array.isArray(users) ? users : []).find((row) => {
            const meta = (row.raw_user_meta_data as AuthUserMeta | null | undefined) ?? null
            const username = readUsernameFromMeta(meta)
            return username ? normalizeUsername(username) === normalizedRequestedUsername : false
          })

          if (!authUser?.id || !authUser.email) {
            return Response.json({ error: 'Profile not found.' }, { status: 404 })
          }

          const [{ data: profile, error: profileError }, { data: identities, error: identitiesError }] = await Promise.all([
            admin
              .from('org_member_profiles')
              .select('display_name, avatar_url, bio, skills, updated_at')
              .eq('email', String(authUser.email).toLowerCase())
              .maybeSingle(),
            admin
              .schema('auth')
              .from('identities')
              .select('provider, identity_data')
              .eq('user_id', authUser.id),
          ])

          if (profileError && profileError.code !== '42P01') {
            return Response.json({ error: profileError.message }, { status: 500 })
          }

          if (identitiesError) {
            return Response.json({ error: identitiesError.message }, { status: 500 })
          }

          const meta = (authUser.raw_user_meta_data as AuthUserMeta | null | undefined) ?? null
          const username = readUsernameFromMeta(meta)
          const connectedAccounts = (Array.isArray(identities) ? identities : [])
            .map((row) => {
              const identity = row as IdentityRow
              const handle =
                identity.identity_data?.preferred_username ||
                identity.identity_data?.username ||
                identity.identity_data?.user_name ||
                identity.identity_data?.channel ||
                null
              const explicitUrl = identity.identity_data?.profile_url || null

              return {
                provider: identity.provider,
                providerLabel: providerLabel(identity.provider),
                handle,
                url: explicitUrl || (handle ? providerProfileUrl(identity.provider, handle) : null),
              }
            })
            .filter((entry) => Boolean(entry.provider))

          return Response.json({
            profile: {
              username: username || normalizedRequestedUsername,
              displayName: profile?.display_name || username || normalizedRequestedUsername,
              avatarUrl: profile?.avatar_url || readAvatarFromMeta(meta),
              bio: profile?.bio || null,
              skills: profile?.skills || [],
              connectedAccounts,
              updatedAt: profile?.updated_at || null,
            },
          })
        } catch (error) {
          if (error instanceof Error) {
            console.error('[public-profile] failed to load profile', error.message)
          }
          return Response.json({ error: 'Could not load public profile right now.' }, { status: 500 })
        }
      },
    },
  },
})
