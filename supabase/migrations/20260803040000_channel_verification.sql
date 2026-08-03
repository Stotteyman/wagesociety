-- Platform verification on a stream listing.
--
-- Some of our creators are verified on their platform, and the listing said nothing
-- about it. The tick is the one piece of information a viewer scanning a grid of
-- channels actually reads as a signal, so it is worth carrying.
--
-- The awkward part is where it comes from. Kick's official API — the one kick-live
-- already uses, with a client_credentials app token — returns no verification field at
-- all: /public/v1/channels gives slug, stream, category and counts, and /public/v1/users
-- gives four fields, none of them a flag. The only source is kick.com's own
-- /api/v2/channels/{slug}, which sits behind Cloudflare and refuses a plain request.
--
-- So this stores three states, not two:
--
--   is_verified = true      checked, and verified
--   is_verified = false     checked, and not verified
--   is_verified = null      never successfully checked — say nothing
--
-- A blocked request leaves the value null. Writing `false` because a request failed
-- would be inventing a fact, and the same rule the admin console lives by applies here:
-- a thing that cannot be fetched is not a zero.
--
-- verified_source records whether a person or a probe put the value there, so a manual
-- override is never quietly replaced by a check that starts working later.

alter table wagesociety.member_livestreams
  add column if not exists is_verified        boolean,
  add column if not exists verified_checked_at timestamptz,
  add column if not exists verified_source     text;

alter table wagesociety.member_livestreams drop constraint if exists member_livestreams_verified_source_check;
alter table wagesociety.member_livestreams add constraint member_livestreams_verified_source_check
  check (verified_source is null or verified_source in ('platform', 'manual'));

-- Adds is_verified. Dropped rather than replaced only because the column list grows in
-- the middle; nothing depends on this view.
drop view if exists public.wagesociety_channels;
create view public.wagesociety_channels as
  select
    ls.platform,
    ls.title,
    ls.url,
    ls.thumbnail_url,
    ls.viewer_count,
    ls.status,
    ls.status = 'live' as is_live,
    p.username,
    p.display_name,
    p.avatar_url,
    p.primary_platform,
    ls.live_checked_at,
    ls.is_verified
  from wagesociety.member_livestreams ls
  join wagesociety.profiles p on p.id = ls.user_id
  where p.is_suspended = false;

grant select on public.wagesociety_channels to anon, authenticated;

/**
 * Set verification by hand.
 *
 * This is not a convenience: Cloudflare stands between us and the only endpoint that
 * knows the answer, so for the foreseeable future this is how a verified channel gets
 * its tick. Passing null clears it back to "we do not know", which is a real state and
 * is different from "not verified".
 */
create or replace function public.ws_admin_set_channel_verified(
  p_channel_id uuid, p_verified boolean
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
declare v_row wagesociety.member_livestreams%rowtype;
begin
  if not public.ws_is_staff('manager') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update wagesociety.member_livestreams set
    is_verified         = p_verified,
    verified_source     = case when p_verified is null then null else 'manual' end,
    verified_checked_at = now()
  where id = p_channel_id
  returning * into v_row;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_channel');
  end if;

  perform public.ws_audit('channel.verified', jsonb_build_object(
    'channel', p_channel_id, 'user', v_row.user_id,
    'platform', v_row.platform, 'verified', p_verified));
  return jsonb_build_object('ok', true, 'verified', p_verified);
end $$;

/** Channels with their verification state, for the admin console. */
create or replace function public.ws_admin_list_channels()
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'wagesociety'
as $$
begin
  if not public.ws_is_staff('manager') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', ls.id, 'user_id', ls.user_id, 'platform', ls.platform,
             'title', ls.title, 'url', ls.url, 'status', ls.status,
             'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
             'is_verified', ls.is_verified, 'verified_source', ls.verified_source,
             'verified_checked_at', ls.verified_checked_at,
             'live_checked_at', ls.live_checked_at
           ) order by p.username, ls.platform)
      from wagesociety.member_livestreams ls
      join wagesociety.profiles p on p.id = ls.user_id
  ), '[]'::jsonb);
end $$;

revoke all on function public.ws_admin_set_channel_verified(uuid, boolean) from public, anon;
revoke all on function public.ws_admin_list_channels()                     from public, anon;
grant execute on function public.ws_admin_set_channel_verified(uuid, boolean) to authenticated;
grant execute on function public.ws_admin_list_channels()                     to authenticated;
