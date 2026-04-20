/**
 * Collaboration Hub API — CRUD for collab requests
 *
 * Required Supabase tables (run in SQL editor):
 *
 * create table if not exists org_collab_requests (
 *   id uuid primary key default gen_random_uuid(),
 *   owner_email text not null,
 *   title text not null check (char_length(title) <= 160),
 *   description text check (char_length(description) <= 2000),
 *   skills_needed text[] not null default '{}',
 *   spots_available integer not null default 1,
 *   status text not null default 'open' check (status in ('open','closed','completed')),
 *   project_url text,
 *   created_at timestamptz not null default now(),
 *   updated_at timestamptz not null default now()
 * );
 * create index on org_collab_requests(status, created_at desc);
 * create index on org_collab_requests(owner_email);
 *
 * create table if not exists org_collab_applications (
 *   id uuid primary key default gen_random_uuid(),
 *   request_id uuid not null references org_collab_requests(id) on delete cascade,
 *   applicant_email text not null,
 *   message text check (char_length(message) <= 500),
 *   status text not null default 'pending' check (status in ('pending','accepted','rejected')),
 *   applied_at timestamptz not null default now(),
 *   unique(request_id, applicant_email)
 * );
 * create index on org_collab_applications(request_id);
 * create index on org_collab_applications(applicant_email);
 */

import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requirePermission } from '../../lib/orgAuth'
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin'

const createSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).default(''),
  skillsNeeded: z.array(z.string().trim().max(40)).max(20).default([]),
  spotsAvailable: z.number().int().min(1).max(20).default(1),
  projectUrl: z.string().url().optional().or(z.literal('')),
})

const updateSchema = createSchema.partial().extend({
  id: z.string().uuid(),
  status: z.enum(['open', 'closed', 'completed']).optional(),
})

const deleteSchema = z.object({ id: z.string().uuid() })

type RawRequest = {
  id: string
  owner_email: string
  title: string
  description: string
  skills_needed: string[]
  spots_available: number
  status: string
  project_url: string | null
  created_at: string
  updated_at: string
}

type RawApplication = { request_id: string }

export const Route = createFileRoute('/api/collab')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const access = await requirePermission(request, 'view_creator_tools')
          const url = new URL(request.url)
          const mine = url.searchParams.get('mine') === '1'
          const admin = getSupabaseAdminClient()

          let query = admin
            .from('org_collab_requests')
            .select('id, owner_email, title, description, skills_needed, spots_available, status, project_url, created_at, updated_at')
            .order('created_at', { ascending: false })

          if (mine) {
            query = query.eq('owner_email', access.requester.email)
          } else {
            query = query.eq('status', 'open')
          }

          const { data, error } = await query

          if (error && error.code !== '42P01') {
            return Response.json({ error: error.message }, { status: 500 })
          }

          const requests: RawRequest[] = data || []

          // IDs where the current user has already applied
          const { data: myApps } = await admin
            .from('org_collab_applications')
            .select('request_id')
            .eq('applicant_email', access.requester.email)

          const myAppRequestIds = new Set(
            (myApps as RawApplication[] | null || []).map((a) => a.request_id)
          )

          // Application counts per request (for owners)
          let appCounts: Record<string, number> = {}
          if (mine && requests.length) {
            const ids = requests.map((r) => r.id)
            const { data: counts } = await admin
              .from('org_collab_applications')
              .select('request_id')
              .in('request_id', ids)
            for (const row of (counts as RawApplication[] | null || [])) {
              appCounts[row.request_id] = (appCounts[row.request_id] || 0) + 1
            }
          }

          return Response.json({
            requests: requests.map((r) => ({
              ...r,
              hasApplied: myAppRequestIds.has(r.id),
              isOwner: r.owner_email === access.requester.email,
              applicantCount: appCounts[r.id] || 0,
            })),
          })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },

      POST: async ({ request }) => {
        try {
          const access = await requirePermission(request, 'view_creator_tools')
          const body = await request.json()
          const parsed = createSchema.safeParse(body)
          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
          }

          const admin = getSupabaseAdminClient()
          const { data, error } = await admin
            .from('org_collab_requests')
            .insert({
              owner_email: access.requester.email,
              title: parsed.data.title,
              description: parsed.data.description,
              skills_needed: parsed.data.skillsNeeded,
              spots_available: parsed.data.spotsAvailable,
              project_url: parsed.data.projectUrl || null,
            })
            .select('id, owner_email, title, description, skills_needed, spots_available, status, project_url, created_at, updated_at')
            .single()

          if (error) return Response.json({ error: error.message }, { status: 500 })
          return Response.json({ request: data })
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
            return Response.json({ error: 'Invalid payload' }, { status: 400 })
          }

          const { id, ...fields } = parsed.data
          const admin = getSupabaseAdminClient()

          const { data, error } = await admin
            .from('org_collab_requests')
            .update({
              ...(fields.title !== undefined && { title: fields.title }),
              ...(fields.description !== undefined && { description: fields.description }),
              ...(fields.skillsNeeded !== undefined && { skills_needed: fields.skillsNeeded }),
              ...(fields.spotsAvailable !== undefined && { spots_available: fields.spotsAvailable }),
              ...(fields.status !== undefined && { status: fields.status }),
              ...(fields.projectUrl !== undefined && { project_url: fields.projectUrl || null }),
              updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .eq('owner_email', access.requester.email)
            .select('id')
            .maybeSingle()

          if (error) return Response.json({ error: error.message }, { status: 500 })
          if (!data) return Response.json({ error: 'Not found or not authorized' }, { status: 403 })
          return Response.json({ updated: true })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },

      DELETE: async ({ request }) => {
        try {
          const access = await requirePermission(request, 'view_creator_tools')
          const body = await request.json()
          const parsed = deleteSchema.safeParse(body)
          if (!parsed.success) {
            return Response.json({ error: 'Invalid payload' }, { status: 400 })
          }

          const admin = getSupabaseAdminClient()
          const { error } = await admin
            .from('org_collab_requests')
            .delete()
            .eq('id', parsed.data.id)
            .eq('owner_email', access.requester.email)

          if (error) return Response.json({ error: error.message }, { status: 500 })
          return Response.json({ deleted: true })
        } catch (error) {
          if (error instanceof Response) return error
          return Response.json({ error: 'Unexpected server error' }, { status: 500 })
        }
      },
    },
  },
})
