import { createFileRoute } from '@tanstack/react-router'
import {
  assignDeterministicUsernames,
  readAvatarFromMetadata,
  readDisplayNameFromMetadata,
  type AuthUserLike,
} from '../../lib/memberDirectory'
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from '../../lib/supabaseAdmin'
import { getSupabaseServerPublicClient } from '../../lib/supabaseServer'

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

type AuthListUserRow = {
  id: string
  email: string | null
  created_at: string
  updated_at?: string
  user_metadata?: AuthUserMeta | null
  identities?: Array<unknown> | null
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

          if (!hasSupabaseAdminConfig()) {
            const client = getSupabaseServerPublicClient()
            const { data: profiles, error: profilesError } = await client
              .from('org_member_profiles')
              .select('email, display_name, avatar_url, bio, skills, updated_at')
              .limit(5000)

            if (profilesError) {
              return Response.json({ error: profilesError.message }, { status: 500 })
            }

            const match = (Array.isArray(profiles) ? profiles : []).find((row) => {
              const email = String(row.email || '').toLowerCase().trim()
              const emailUsername = email.split('@')[0] || ''
              const display = String(row.display_name || '').trim()
              const candidate = normalizeUsername(display || emailUsername)
              return candidate === normalizedRequestedUsername
            })

            if (!match) {
              return Response.json({ error: 'Profile not found.' }, { status: 404 })
            }

            const email = String(match.email || '').toLowerCase().trim()
            const emailUsername = email.split('@')[0] || normalizedRequestedUsername

            return Response.json({
              profile: {
                username: normalizeUsername(String(match.display_name || '').trim() || emailUsername),
                displayName: String(match.display_name || '').trim() || emailUsername,
                avatarUrl: match.avatar_url || null,
                bio: match.bio || null,
                skills: Array.isArray(match.skills) ? match.skills : [],
                connectedAccounts: [],
                updatedAt: match.updated_at || null,
              },
            })
          }

          const admin = getSupabaseAdminClient()
          const users: AuthListUserRow[] = []
          let page = 1
          const perPage = 1000

          while (page <= 10) {
            const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page, perPage })
            if (usersError) {
              return Response.json({ error: usersError.message }, { status: 500 })
            }

            const pageUsers = (usersData?.users || []) as AuthListUserRow[]
            if (!pageUsers.length) break
            users.push(...pageUsers)
            if (pageUsers.length < perPage) break
            page += 1
          }

          const usernameMap = assignDeterministicUsernames(users as AuthUserLike[])
          const userByUsername = new Map<string, AuthListUserRow>()

          for (const user of users) {
            const username = usernameMap.get(String(user.id || ''))
            if (!username) continue
            userByUsername.set(normalizeUsername(username), user)
          }

          const authUser = userByUsername.get(normalizedRequestedUsername)

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

          const meta = (authUser.user_metadata as AuthUserMeta | null | undefined) ?? null
          const username = usernameMap.get(String(authUser.id)) || normalizedRequestedUsername
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
              username,
              displayName: profile?.display_name || readDisplayNameFromMetadata(meta) || username,
              avatarUrl: profile?.avatar_url || readAvatarFromMetadata(meta),
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
