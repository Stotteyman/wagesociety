-- Badge customisation: shape and glyph become independent.
--
-- They used to be welded together — a shield always got a star, a hex always got a check
-- — because the React component keyed the inner mark off the outer silhouette. That gave
-- eight looks in total and no way to make a new badge that did not resemble an existing
-- one.
--
-- Splitting them into two columns gives 16 shapes x 21 glyphs, and any combination is
-- legal. The check constraints mirror the SHAPES and GLYPHS maps in
-- src/components/ui/ProfileBadges.tsx exactly: the database must never hold a look the
-- component cannot draw, because an unknown value renders as nothing at all and a badge
-- that renders as nothing is invisible rather than obviously broken.
--
-- Adding a shape or glyph means adding it in both places. There is no way around that
-- without moving SVG path data into the database, which is worse.

alter table wagesociety.badges
  add column if not exists glyph text not null default 'none';

-- Preserve exactly what each existing badge looked like before the split, so nothing
-- changes appearance on deploy.
update wagesociety.badges set glyph = 'star'  where slug in ('founder','og') and glyph = 'none';
update wagesociety.badges set glyph = 'check' where slug in ('staff','verified') and glyph = 'none';

alter table wagesociety.badges drop constraint if exists badges_shape_check;
alter table wagesociety.badges add constraint badges_shape_check
  check (shape in (
    'circle','shield','hex','hex_flat','square','rounded','diamond','burst',
    'seal','medal','chevron','bolt','crown','ribbon','banner','flame','star','tag'
  ));

alter table wagesociety.badges drop constraint if exists badges_glyph_check;
alter table wagesociety.badges add constraint badges_glyph_check
  check (glyph in (
    'none','star','check','crown','bolt','heart','flame','diamond','plus','dollar',
    'play','mic','camera','code','sparkle','eye','key','leaf','anchor','shield','trophy'
  ));

comment on column wagesociety.badges.shape is
  'Outer silhouette. Mirrors the SHAPES map in src/components/ui/ProfileBadges.tsx.';
comment on column wagesociety.badges.glyph is
  'Inner mark, independent of shape. Mirrors the GLYPHS map in the same file.';

/* ── glyph reaches every read path ───────────────────────────────────────── */

create or replace function public.ws_admin_list_badges()
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'wagesociety'
as $$
begin
  if not public.ws_is_staff('staff') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'slug', b.slug, 'label', b.label, 'description', b.description,
             'color', b.color, 'shape', b.shape, 'glyph', b.glyph,
             'sort_order', b.sort_order,
             'is_active', b.is_active, 'is_builtin', b.is_builtin,
             'floor_tier', b.floor_tier, 'discount_tier', b.discount_tier,
             'discord_role_id', b.discord_role_id,
             'holders', (select count(*) from wagesociety.user_badges ub where ub.badge_slug = b.slug)
           ) order by b.sort_order, b.slug)
      from wagesociety.badges b
  ), '[]'::jsonb);
end $$;

create or replace function public.ws_admin_save_badge(
  p_slug text, p_label text, p_description text,
  p_color text, p_shape text,
  p_sort_order integer default 100, p_is_active boolean default true,
  p_glyph text default 'none'
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
declare v_slug text := lower(btrim(coalesce(p_slug, '')));
begin
  if not public.ws_is_staff('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_slug !~ '^[a-z][a-z0-9_]{1,29}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_slug');
  end if;

  insert into wagesociety.badges (slug, label, description, color, shape, glyph, sort_order, is_active)
  values (v_slug, btrim(p_label), btrim(coalesce(p_description, '')),
          upper(p_color), p_shape, coalesce(nullif(p_glyph, ''), 'none'),
          coalesce(p_sort_order, 100), coalesce(p_is_active, true))
  on conflict (slug) do update set
    label       = excluded.label,
    description = excluded.description,
    color       = excluded.color,
    shape       = excluded.shape,
    glyph       = excluded.glyph,
    sort_order  = excluded.sort_order,
    is_active   = excluded.is_active,
    updated_at  = now();

  perform public.ws_audit('badge.save', jsonb_build_object(
    'badge', v_slug, 'label', p_label, 'shape', p_shape, 'glyph', p_glyph, 'color', p_color));
  return jsonb_build_object('ok', true, 'slug', v_slug);
end $$;

-- The public creator view carries the glyph too, or every badge on a profile renders
-- with no inner mark.
drop view if exists public.wagesociety_creators;
create view public.wagesociety_creators as
  select
    p.username, p.display_name, p.avatar_url, p.bio, p.skills, p.primary_platform,
    p.tier, p.referral_tier, p.connected_count,
    p.youtube_channel_name, p.youtube_channel_avatar, p.created_at,
    exists (
      select 1 from wagesociety.member_livestreams ls
       where ls.user_id = p.id and ls.status = 'live'
    ) as is_live,
    p.featured_youtube_channel_id,
    p.social_links,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', b.slug, 'label', b.label, 'description', b.description,
               'color', b.color, 'shape', b.shape, 'glyph', b.glyph
             ) order by b.sort_order, b.slug)
        from wagesociety.user_badges ub
        join wagesociety.badges b on b.slug = ub.badge_slug
       where ub.user_id = p.id and b.is_active
    ), '[]'::jsonb) as badges
  from wagesociety.profiles p
  where p.is_suspended = false
    and p.is_dev_account = false
    and p.username is not null
    and p.email not ilike '%@wagesociety.com'
    and p.email not ilike '%wagesocietydev%';

grant select on public.wagesociety_creators to anon, authenticated;

revoke all on function public.ws_admin_list_badges() from public, anon;
revoke all on function public.ws_admin_save_badge(text, text, text, text, text, integer, boolean, text) from public, anon;
grant execute on function public.ws_admin_list_badges() to authenticated;
grant execute on function public.ws_admin_save_badge(text, text, text, text, text, integer, boolean, text) to authenticated;

-- The 7-argument signature is gone. Leaving it callable would let a stale bundle save a
-- badge and silently reset its glyph to the default.
drop function if exists public.ws_admin_save_badge(text, text, text, text, text, integer, boolean);

-- Every other place a badge object is built. Missing the glyph anywhere means badges
-- render as bare silhouettes on that one screen, which looks like a rendering bug rather
-- than a missing column.
create or replace function public.ws_admin_user_badges(p_user_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'wagesociety'
as $$
begin
  if not public.ws_is_staff('staff') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'slug', b.slug, 'label', b.label, 'color', b.color,
             'shape', b.shape, 'glyph', b.glyph,
             'granted_at', ub.granted_at, 'note', ub.note,
             'granted_by', (select email from wagesociety.profiles g where g.id = ub.granted_by)
           ) order by b.sort_order, b.slug)
      from wagesociety.user_badges ub
      join wagesociety.badges b on b.slug = ub.badge_slug
     where ub.user_id = p_user_id
  ), '[]'::jsonb);
end $$;

create or replace function public.ws_referrer_info(p_ref text)
returns jsonb
language sql stable security definer
set search_path to 'public', 'wagesociety'
as $$
  select jsonb_build_object(
    'username',     p.username,
    'display_name', p.display_name,
    'avatar_url',   p.avatar_url,
    'bio',          p.bio,
    'tier',         p.tier,
    'badges', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', b.slug, 'label', b.label, 'description', b.description,
               'color', b.color, 'shape', b.shape, 'glyph', b.glyph) order by b.sort_order)
        from wagesociety.user_badges ub
        join wagesociety.badges b on b.slug = ub.badge_slug
       where ub.user_id = p.id and b.is_active), '[]'::jsonb),
    'reward_joiner', coalesce(
      (select (value #>> '{}')::int from wagesociety.app_settings where key = 'referral_reward_joiner'), 200),
    'reward_referrer', coalesce(
      (select (value #>> '{}')::int from wagesociety.app_settings where key = 'referral_reward_referrer'), 150)
  )
  from wagesociety.profiles p
  where (lower(p.username) = lower(btrim(coalesce(p_ref, '')))
         or upper(p.referral_code) = upper(btrim(coalesce(p_ref, ''))))
    and p.is_suspended = false
    and p.username is not null
  limit 1;
$$;

revoke all on function public.ws_admin_user_badges(uuid) from public, anon;
revoke all on function public.ws_referrer_info(text)     from public;
grant execute on function public.ws_admin_user_badges(uuid) to authenticated;
grant execute on function public.ws_referrer_info(text)     to anon, authenticated;

-- The two admin reads that embed badges as well.
create or replace function public.ws_admin_list_users(p_search text default null)
returns jsonb
language plpgsql stable security definer
set search_path to 'wagesociety', 'public'
as $$
begin
  if not public.ws_is_staff('manager') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'email', p.email, 'username', p.username, 'display_name', p.display_name,
      'avatar_url', p.avatar_url,
      'tier', p.tier, 'points', p.referral_points, 'suspended', p.is_suspended,
      'created_at', p.created_at,
      'role', coalesce((select ro.name from wagesociety.user_roles ur
                          join wagesociety.roles ro on ro.id = ur.role_id
                         where ur.user_id = p.id order by ro.priority desc limit 1), 'member'),
      'role_source', (select ur.source from wagesociety.user_roles ur where ur.user_id = p.id limit 1),
      'badges', coalesce((select jsonb_agg(jsonb_build_object(
                            'slug', b.slug, 'label', b.label, 'color', b.color,
                            'shape', b.shape, 'glyph', b.glyph)
                            order by b.sort_order)
                            from wagesociety.user_badges ub
                            join wagesociety.badges b on b.slug = ub.badge_slug
                           where ub.user_id = p.id), '[]'::jsonb),
      'discord_linked', exists (select 1 from wagesociety.discord_links dl where dl.user_id = p.id),
      'membership', (select status from wagesociety.user_memberships um
                      where um.user_id = p.id and um.status in ('active','trialing')
                      order by um.created_at desc limit 1),
      'trial_ends_at', (select to_char(trial_ends_at,'YYYY-MM-DD') from wagesociety.user_memberships um
                         where um.user_id = p.id and um.status = 'trialing'
                         order by um.created_at desc limit 1)
    ) order by p.created_at desc)
    from wagesociety.profiles p
    where p_search is null
       or p.email ilike '%'||p_search||'%'
       or p.username ilike '%'||p_search||'%'
       or coalesce(p.display_name,'') ilike '%'||p_search||'%'
  ), '[]'::jsonb);
end $$;

revoke all on function public.ws_admin_list_users(text) from public, anon;
grant execute on function public.ws_admin_list_users(text) to authenticated;
