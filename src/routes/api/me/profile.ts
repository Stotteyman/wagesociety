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
import { getSupabaseAdminClient } from '../../../lib/supabaseAdmin'

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/

const updateSchema = z.object({
  displayName: z.string().trim().max(20).optional(),
  avatarUrl: z.string().url().optional().or(z.literal('')),
  bio: z.string().trim().max(500).optional(),
  skills: z.array(z.string().trim().max(40)).max(30).optional(),
})

type AuthUserMeta = {
  username?: string
  full_name?: string
  name?: string
  preferred_username?: string
}

function readDisplayNameFromMeta(meta: AuthUserMeta | null | undefined) {
  const candidates = [meta?.username, meta?.full_name, meta?.name, meta?.preferred_username]
  for (const candidate of candidates) {
    const trimmed = candidate?.trim()
    if (trimmed) return trimmed
  }
  return null
}

function createFallbackProfile(email: string, displayName: string | null) {
  return {
    email,
    display_name: displayName,
    avatar_url: null,
    bio: null,
    skills: [] as string[],
    updated_at: null,
    username_changed_at: null,
  }
}

export const Route = createFileRoute('/api/me/profile')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const access = await requirePermission(request, 'view_creator_tools')
          const admin = getSupabaseAdminClient()

          const [{ data: profile, error: profileError }, { data: authUser, error: authUserError }] = await Promise.all([
            admin
              .from('org_member_profiles')
              .select('email, display_name, avatar_url, bio, skills, updated_at, username_changed_at')
              .eq('email', access.requester.email)
              .maybeSingle(),
            admin
              .schema('auth')
              .from('users')
              .select('raw_user_meta_data')
              .eq('email', access.requester.email)
              .maybeSingle(),
          ])

          if (profileError && profileError.code !== '42P01') {
            return Response.json({ error: profileError.message }, { status: 500 })
          }

          if (authUserError) {
            return Response.json({ error: authUserError.message }, { status: 500 })
          }

          const meta = (authUser?.raw_user_meta_data as AuthUserMeta | null | undefined) ?? null
          const authDisplayName = readDisplayNameFromMeta(meta)

          return Response.json({
            profile: profile
              ? {
                  ...profile,
                  display_name: profile.display_name || authDisplayName,
                }
              : createFallbackProfile(access.requester.email, authDisplayName),
          })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },

      PUT: async ({ request }) => {
        try {
          const access = await requirePermission(request, 'view_creator_tools')
          const body = await request.json()
          const parsed = updateSchema.safeParse(body)
          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          const admin = getSupabaseAdminClient()

          const { data: authUsers, error: authUsersError } = await admin
            .schema('auth')
            .from('users')
            .select('id, email, raw_user_meta_data')

          if (authUsersError) {
            return Response.json({ error: authUsersError.message }, { status: 500 })
          }

          const authUserList = Array.isArray(authUsers) ? authUsers : []

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
              const { data: existing, error: checkError } = await admin
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

              const normalized = newName.toLowerCase()
              const takenInAuth = authUserList.some((userRow) => {
                const rowEmail = String(userRow.email || '').toLowerCase()
                if (!rowEmail || rowEmail === access.requester.email) return false
                const metadata = (userRow.raw_user_meta_data as AuthUserMeta | null | undefined) ?? null
                const candidates = [metadata?.username, metadata?.full_name, metadata?.name, metadata?.preferred_username]
                return candidates.some((candidate) => candidate?.trim().toLowerCase() === normalized)
              })

              if (takenInAuth) {
                return Response.json({ error: 'That username is already taken. Please choose another.' }, { status: 409 })
              }
            }
          }

          const currentAuthUser = authUserList.find(
            (userRow) => String(userRow.email || '').toLowerCase() === access.requester.email,
          )

          if (currentAuthUser?.id && parsed.data.displayName !== undefined) {
            const existingMeta = (currentAuthUser.raw_user_meta_data as AuthUserMeta | null | undefined) ?? {}
            const trimmedDisplayName = parsed.data.displayName.trim()
            const nextName = trimmedDisplayName || readDisplayNameFromMeta(existingMeta) || ''

            const { error: updateAuthError } = await admin.auth.admin.updateUserById(currentAuthUser.id, {
              user_metadata: {
                ...existingMeta,
                username: nextName,
                full_name: nextName,
                name: nextName,
                preferred_username: nextName,
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

          const { data, error } = await admin
            .from('org_member_profiles')
            .upsert(payload, { onConflict: 'email' })
            .select('email, display_name, avatar_url, bio, skills, updated_at, username_changed_at')
            .single()

          if (error && error.code !== '42P01') {
            return Response.json({ error: error.message }, { status: 500 })
          }

          if (data) {
            return Response.json({ profile: data })
          }

          const ownAuthMeta = (currentAuthUser?.raw_user_meta_data as AuthUserMeta | null | undefined) ?? null
          const fallbackDisplayName =
            parsed.data.displayName?.trim() || readDisplayNameFromMeta(ownAuthMeta)

          return Response.json({
            profile: createFallbackProfile(access.requester.email, fallbackDisplayName || null),
          })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },
    },
  },
})
