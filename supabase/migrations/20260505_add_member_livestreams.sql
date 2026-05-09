-- Create org_member_livestreams table to store member livestream selections
-- This allows members to set their preferred livestream channel for display on the platform

create table if not exists public.org_member_livestreams (
  id uuid primary key default gen_random_uuid(),
  email text not null unique references auth.users(email) on delete cascade,
  
  -- Platform and stream info
  platform text not null check (platform in ('youtube', 'twitch', 'kick')),
  stream_key text not null, -- e.g., "handle:stotteyman", "channel:UCxxxxx", or "user:stotteyman"
  stream_url text not null, -- Full URL to the stream
  
  -- Display info
  display_name text, -- Member's display name for the livestream
  avatar_url text, -- Member's avatar
  
  -- Metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.org_member_livestreams enable row level security;

-- Allow read access to anyone
create policy "allow_read_livestreams" on public.org_member_livestreams
  for select using (true);

-- Allow members to update their own livestream
create policy "allow_update_own_livestream" on public.org_member_livestreams
  for update using (auth.jwt() ->> 'email' = email);

-- Allow members to insert their own livestream
create policy "allow_insert_livestream" on public.org_member_livestreams
  for insert with check (auth.jwt() ->> 'email' = email);

-- Allow members to delete their own livestream
create policy "allow_delete_livestream" on public.org_member_livestreams
  for delete using (auth.jwt() ->> 'email' = email);

-- Create index for faster lookups by email
create index if not exists idx_org_member_livestreams_email on public.org_member_livestreams(email);

-- Create index for faster lookups by platform and stream_key
create index if not exists idx_org_member_livestreams_platform_key on public.org_member_livestreams(platform, stream_key);

-- Create trigger to update updated_at timestamp
create or replace function public.update_org_member_livestreams_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_org_member_livestreams_updated_at_trigger
  before update on public.org_member_livestreams
  for each row
  execute function public.update_org_member_livestreams_updated_at();
