-- Enable RLS and define explicit policies for core public tables surfaced by PostgREST.
-- This resolves Security Advisor findings for tables with RLS disabled.

-- ------------------------------------------------------------
-- org_collab_requests
-- ------------------------------------------------------------
alter table if exists public.org_collab_requests enable row level security;

drop policy if exists "org_collab_requests_select_open_or_own" on public.org_collab_requests;
create policy "org_collab_requests_select_open_or_own"
  on public.org_collab_requests
  for select
  using (
    status = 'open'
    or owner_email = (auth.jwt() ->> 'email')
  );

drop policy if exists "org_collab_requests_insert_own" on public.org_collab_requests;
create policy "org_collab_requests_insert_own"
  on public.org_collab_requests
  for insert
  with check (
    owner_email = (auth.jwt() ->> 'email')
  );

drop policy if exists "org_collab_requests_update_own" on public.org_collab_requests;
create policy "org_collab_requests_update_own"
  on public.org_collab_requests
  for update
  using (
    owner_email = (auth.jwt() ->> 'email')
  )
  with check (
    owner_email = (auth.jwt() ->> 'email')
  );

drop policy if exists "org_collab_requests_delete_own" on public.org_collab_requests;
create policy "org_collab_requests_delete_own"
  on public.org_collab_requests
  for delete
  using (
    owner_email = (auth.jwt() ->> 'email')
  );

-- ------------------------------------------------------------
-- org_collab_applications
-- ------------------------------------------------------------
alter table if exists public.org_collab_applications enable row level security;

drop policy if exists "org_collab_applications_select_related" on public.org_collab_applications;
create policy "org_collab_applications_select_related"
  on public.org_collab_applications
  for select
  using (
    applicant_email = (auth.jwt() ->> 'email')
    or exists (
      select 1
      from public.org_collab_requests r
      where r.id = org_collab_applications.request_id
        and r.owner_email = (auth.jwt() ->> 'email')
    )
  );

drop policy if exists "org_collab_applications_insert_own" on public.org_collab_applications;
create policy "org_collab_applications_insert_own"
  on public.org_collab_applications
  for insert
  with check (
    applicant_email = (auth.jwt() ->> 'email')
  );

drop policy if exists "org_collab_applications_update_related" on public.org_collab_applications;
create policy "org_collab_applications_update_related"
  on public.org_collab_applications
  for update
  using (
    applicant_email = (auth.jwt() ->> 'email')
    or exists (
      select 1
      from public.org_collab_requests r
      where r.id = org_collab_applications.request_id
        and r.owner_email = (auth.jwt() ->> 'email')
    )
  )
  with check (
    applicant_email = (auth.jwt() ->> 'email')
    or exists (
      select 1
      from public.org_collab_requests r
      where r.id = org_collab_applications.request_id
        and r.owner_email = (auth.jwt() ->> 'email')
    )
  );

drop policy if exists "org_collab_applications_delete_related" on public.org_collab_applications;
create policy "org_collab_applications_delete_related"
  on public.org_collab_applications
  for delete
  using (
    applicant_email = (auth.jwt() ->> 'email')
    or exists (
      select 1
      from public.org_collab_requests r
      where r.id = org_collab_applications.request_id
        and r.owner_email = (auth.jwt() ->> 'email')
    )
  );

-- ------------------------------------------------------------
-- org_member_profiles
-- ------------------------------------------------------------
alter table if exists public.org_member_profiles enable row level security;

drop policy if exists "org_member_profiles_select_public" on public.org_member_profiles;
create policy "org_member_profiles_select_public"
  on public.org_member_profiles
  for select
  using (true);

drop policy if exists "org_member_profiles_insert_own" on public.org_member_profiles;
create policy "org_member_profiles_insert_own"
  on public.org_member_profiles
  for insert
  with check (
    email = (auth.jwt() ->> 'email')
  );

drop policy if exists "org_member_profiles_update_own" on public.org_member_profiles;
create policy "org_member_profiles_update_own"
  on public.org_member_profiles
  for update
  using (
    email = (auth.jwt() ->> 'email')
  )
  with check (
    email = (auth.jwt() ->> 'email')
  );

drop policy if exists "org_member_profiles_delete_own" on public.org_member_profiles;
create policy "org_member_profiles_delete_own"
  on public.org_member_profiles
  for delete
  using (
    email = (auth.jwt() ->> 'email')
  );

-- ------------------------------------------------------------
-- org_blog_posts
-- ------------------------------------------------------------
alter table if exists public.org_blog_posts enable row level security;

drop policy if exists "org_blog_posts_select_published_or_author" on public.org_blog_posts;
create policy "org_blog_posts_select_published_or_author"
  on public.org_blog_posts
  for select
  using (
    coalesce(is_published, false) = true
    or author_email = (auth.jwt() ->> 'email')
  );

drop policy if exists "org_blog_posts_insert_author" on public.org_blog_posts;
create policy "org_blog_posts_insert_author"
  on public.org_blog_posts
  for insert
  with check (
    author_email = (auth.jwt() ->> 'email')
  );

drop policy if exists "org_blog_posts_update_author" on public.org_blog_posts;
create policy "org_blog_posts_update_author"
  on public.org_blog_posts
  for update
  using (
    author_email = (auth.jwt() ->> 'email')
  )
  with check (
    author_email = (auth.jwt() ->> 'email')
  );

drop policy if exists "org_blog_posts_delete_author" on public.org_blog_posts;
create policy "org_blog_posts_delete_author"
  on public.org_blog_posts
  for delete
  using (
    author_email = (auth.jwt() ->> 'email')
  );

-- ------------------------------------------------------------
-- org_dashboard_tool_entries
-- ------------------------------------------------------------
alter table if exists public.org_dashboard_tool_entries enable row level security;

drop policy if exists "org_dashboard_tool_entries_select_authenticated" on public.org_dashboard_tool_entries;
create policy "org_dashboard_tool_entries_select_authenticated"
  on public.org_dashboard_tool_entries
  for select
  using (
    coalesce(auth.jwt() ->> 'email', '') <> ''
  );

drop policy if exists "org_dashboard_tool_entries_insert_creator" on public.org_dashboard_tool_entries;
create policy "org_dashboard_tool_entries_insert_creator"
  on public.org_dashboard_tool_entries
  for insert
  with check (
    created_by = (auth.jwt() ->> 'email')
  );

drop policy if exists "org_dashboard_tool_entries_update_creator" on public.org_dashboard_tool_entries;
create policy "org_dashboard_tool_entries_update_creator"
  on public.org_dashboard_tool_entries
  for update
  using (
    created_by = (auth.jwt() ->> 'email')
  )
  with check (
    created_by = (auth.jwt() ->> 'email')
  );

drop policy if exists "org_dashboard_tool_entries_delete_creator" on public.org_dashboard_tool_entries;
create policy "org_dashboard_tool_entries_delete_creator"
  on public.org_dashboard_tool_entries
  for delete
  using (
    created_by = (auth.jwt() ->> 'email')
  );