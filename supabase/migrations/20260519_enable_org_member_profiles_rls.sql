alter table public.org_member_profiles enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'org_member_profiles'
      and policyname = 'Own profile select'
  ) then
    create policy "Own profile select"
    on public.org_member_profiles
    for select
    to authenticated
    using (email = auth.jwt() ->> 'email');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'org_member_profiles'
      and policyname = 'Own profile insert'
  ) then
    create policy "Own profile insert"
    on public.org_member_profiles
    for insert
    to authenticated
    with check (email = auth.jwt() ->> 'email');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'org_member_profiles'
      and policyname = 'Own profile update'
  ) then
    create policy "Own profile update"
    on public.org_member_profiles
    for update
    to authenticated
    using (email = auth.jwt() ->> 'email')
    with check (email = auth.jwt() ->> 'email');
  end if;
end $$;