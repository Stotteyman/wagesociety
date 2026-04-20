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
 *   website text,
 *   social_links jsonb not null default '{}',
 *   updated_at timestamptz not null default now()
 * );
 */

import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requirePermission } from '../../../lib/orgAuth'
import { getSupabaseAdminClient } from '../../../lib/supabaseAdmin'

const socialLinksSchema = z.object({
  instagram: z.string().max(80).optional(),
  tiktok: z.string().max(80).optional(),
  youtube: z.string().max(160).optional(),
  twitch: z.string().max(80).optional(),
  twitter: z.string().max(80).optional(),
  steam: z.string().max(80).optional(),
  linkedin: z.string().max(160).optional(),
  facebook: z.string().max(160).optional(),
  discord: z.string().max(120).optional(),
  kick: z.string().max(80).optional(),
})

const updateSchema = z.object({
  displayName: z.string().trim().max(80).optional(),
  avatarUrl: z.string().url().optional().or(z.literal('')),
  bio: z.string().trim().max(500).optional(),
  skills: z.array(z.string().trim().max(40)).max(30).optional(),
  website: z.string().url().optional().or(z.literal('')),
  socialLinks: socialLinksSchema.optional(),
})

export const Route = createFileRoute('/api/me/profile')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const access = await requirePermission(request, 'view_creator_tools')
          const admin = getSupabaseAdminClient()

          const { data, error } = await admin
            .from('org_member_profiles')
            .select('email, display_name, avatar_url, bio, skills, website, social_links, updated_at')
            .eq('email', access.requester.email)
            .maybeSingle()

          if (error && error.code !== '42P01') {
            return Response.json({ error: error.message }, { status: 500 })
          }

          return Response.json({
            profile: data || {
              email: access.requester.email,
              display_name: null,
              avatar_url: null,
              bio: null,
              skills: [],
              website: null,
              social_links: {},
              updated_at: null,
            },
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

          const payload: Record<string, unknown> = {
            email: access.requester.email,
            updated_at: new Date().toISOString(),
          }
          if (parsed.data.displayName !== undefined) payload.display_name = parsed.data.displayName
          if (parsed.data.avatarUrl !== undefined) payload.avatar_url = parsed.data.avatarUrl || null
          if (parsed.data.bio !== undefined) payload.bio = parsed.data.bio
          if (parsed.data.skills !== undefined) payload.skills = parsed.data.skills
          if (parsed.data.website !== undefined) payload.website = parsed.data.website || null
          if (parsed.data.socialLinks !== undefined) payload.social_links = parsed.data.socialLinks

          const { data, error } = await admin
            .from('org_member_profiles')
            .upsert(payload, { onConflict: 'email' })
            .select('email, display_name, avatar_url, bio, skills, website, social_links, updated_at')
            .single()

          if (error) return Response.json({ error: error.message }, { status: 500 })
          return Response.json({ profile: data })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },
    },
  },
})
