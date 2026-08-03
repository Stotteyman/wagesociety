-- Badges: from a fixed set of four to a catalog the admin console can run.
--
-- wagesociety.badges and user_badges already existed, and four badges were already
-- seeded and held by thirteen people. What was missing was any way to grant one —
-- there was no ws_admin_* function for it at all, so the only route was raw SQL.
--
-- Two things change here:
--
--  1. A badge now carries its own colour and shape. Before, appearance lived only in
--     the React component's EMBLEMS map, so a badge created in the database would have
--     rendered as nothing at all — the component skips slugs it does not know. Storing
--     colour + shape means a badge invented tonight shows up on profiles tonight.
--
--  2. Grant/revoke/edit RPCs, gated on a new `manage_badges` permission and audited
--     like every other admin mutation.
--
-- Built-in badges are marked and cannot be deleted: `staff` is assigned by the Discord
-- role sync and `og` by the profiles_grant_og trigger, so dropping the row would break
-- a writer that has no idea the UI exists.

/* ── catalog ─────────────────────────────────────────────────────────────── */

alter table wagesociety.badges
  add column if not exists color      text    not null default '#FFAA33',
  add column if not exists shape      text    not null default 'shield',
  add column if not exists is_active  boolean not null default true,
  add column if not exists is_builtin boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- Kept in step with the SHAPES map in src/components/ui/ProfileBadges.tsx. A shape the
-- component does not know would render nothing, which is the exact failure this
-- migration exists to remove, so the database refuses to store one.
alter table wagesociety.badges drop constraint if exists badges_shape_check;
alter table wagesociety.badges add constraint badges_shape_check
  check (shape in ('shield','hex','burst','medal','circle','chevron','bolt','crown'));

-- Colour is rendered straight into an SVG fill. Constrain it to a hex literal so a
-- stored value can never become markup.
alter table wagesociety.badges drop constraint if exists badges_color_check;
alter table wagesociety.badges add constraint badges_color_check
  check (color ~ '^#[0-9A-Fa-f]{6}$');

alter table wagesociety.badges drop constraint if exists badges_slug_check;
alter table wagesociety.badges add constraint badges_slug_check
  check (slug ~ '^[a-z][a-z0-9_]{1,29}$');

-- Backfill the four originals with the colours and silhouettes the component already
-- drew for them, so the database becomes the source of truth without anything moving.
update wagesociety.badges set color = '#FC9000', shape = 'shield', is_builtin = true where slug = 'founder';
update wagesociety.badges set color = '#E4E4E8', shape = 'hex',    is_builtin = true where slug = 'staff';
update wagesociety.badges set color = '#FFAA33', shape = 'burst',  is_builtin = true where slug = 'verified';
update wagesociety.badges set color = '#E43000', shape = 'medal',  is_builtin = true where slug = 'og';

create index if not exists user_badges_slug_idx on wagesociety.user_badges (badge_slug);

/* ── public view ─────────────────────────────────────────────────────────── */

-- badges was a text[] of slugs, which forced the browser to already know what a slug
-- looks like. It becomes an array of objects so a new badge needs no code change.
--
-- Dropped rather than replaced: `create or replace view` cannot change a column's type,
-- and this changes badges from text[] to jsonb.
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
               'color', b.color, 'shape', b.shape
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

/* ── permission ──────────────────────────────────────────────────────────── */

insert into wagesociety.permissions (key, description)
values ('manage_badges', 'Grant and revoke profile badges')
on conflict (key) do nothing;

-- Managers and above get it by default; staff do not, because a badge is a public
-- claim about a member and handing that to every helper is how it gets devalued.
insert into wagesociety.role_permissions (role_id, permission_id)
select r.id, p.id
  from wagesociety.roles r, wagesociety.permissions p
 where p.key = 'manage_badges' and r.name in ('manager','admin')
on conflict do nothing;

/* ── read ────────────────────────────────────────────────────────────────── */

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
             'color', b.color, 'shape', b.shape, 'sort_order', b.sort_order,
             'is_active', b.is_active, 'is_builtin', b.is_builtin,
             'holders', (select count(*) from wagesociety.user_badges ub where ub.badge_slug = b.slug)
           ) order by b.sort_order, b.slug)
      from wagesociety.badges b
  ), '[]'::jsonb);
end $$;

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
             'slug', b.slug, 'label', b.label, 'color', b.color, 'shape', b.shape,
             'granted_at', ub.granted_at, 'note', ub.note,
             'granted_by', (select email from wagesociety.profiles g where g.id = ub.granted_by)
           ) order by b.sort_order, b.slug)
      from wagesociety.user_badges ub
      join wagesociety.badges b on b.slug = ub.badge_slug
     where ub.user_id = p_user_id
  ), '[]'::jsonb);
end $$;

/* ── grant / revoke ──────────────────────────────────────────────────────── */

create or replace function public.ws_admin_grant_badge(
  p_user_id uuid, p_slug text, p_note text default null
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
declare v_label text; v_email text;
begin
  if not public.ws_has_permission('manage_badges') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select label into v_label from wagesociety.badges where slug = p_slug and is_active;
  if v_label is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_badge');
  end if;
  select email into v_email from wagesociety.profiles where id = p_user_id;
  if v_email is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_user');
  end if;

  insert into wagesociety.user_badges (user_id, badge_slug, granted_by, note)
  values (p_user_id, p_slug, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (user_id, badge_slug) do update
     set note = excluded.note, granted_by = excluded.granted_by;

  perform public.ws_audit('badge.grant', jsonb_build_object(
    'user', p_user_id, 'email', v_email, 'badge', p_slug, 'note', p_note));
  return jsonb_build_object('ok', true, 'badge', p_slug, 'label', v_label);
end $$;

create or replace function public.ws_admin_revoke_badge(p_user_id uuid, p_slug text)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
declare v_email text; v_hit int;
begin
  if not public.ws_has_permission('manage_badges') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select email into v_email from wagesociety.profiles where id = p_user_id;

  delete from wagesociety.user_badges where user_id = p_user_id and badge_slug = p_slug;
  get diagnostics v_hit = row_count;
  if v_hit = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_held');
  end if;

  perform public.ws_audit('badge.revoke', jsonb_build_object(
    'user', p_user_id, 'email', v_email, 'badge', p_slug));
  return jsonb_build_object('ok', true, 'badge', p_slug);
end $$;

/* ── catalog editing ─────────────────────────────────────────────────────── */

create or replace function public.ws_admin_save_badge(
  p_slug text, p_label text, p_description text,
  p_color text, p_shape text,
  p_sort_order integer default 100, p_is_active boolean default true
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

  insert into wagesociety.badges (slug, label, description, color, shape, sort_order, is_active)
  values (v_slug, btrim(p_label), btrim(coalesce(p_description, '')),
          upper(p_color), p_shape, coalesce(p_sort_order, 100), coalesce(p_is_active, true))
  on conflict (slug) do update set
    label       = excluded.label,
    description = excluded.description,
    color       = excluded.color,
    shape       = excluded.shape,
    sort_order  = excluded.sort_order,
    is_active   = excluded.is_active,
    updated_at  = now();

  perform public.ws_audit('badge.save', jsonb_build_object('badge', v_slug, 'label', p_label));
  return jsonb_build_object('ok', true, 'slug', v_slug);
end $$;

create or replace function public.ws_admin_delete_badge(p_slug text)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
declare v_builtin boolean; v_holders int;
begin
  if not public.ws_is_staff('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select is_builtin into v_builtin from wagesociety.badges where slug = p_slug;
  if v_builtin is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_badge');
  end if;
  -- staff is written by the Discord role sync and og by a trigger on profiles. Deleting
  -- either would break a writer that never checks whether the row still exists.
  if v_builtin then
    return jsonb_build_object('ok', false, 'reason', 'builtin');
  end if;

  select count(*) into v_holders from wagesociety.user_badges where badge_slug = p_slug;
  delete from wagesociety.user_badges where badge_slug = p_slug;
  delete from wagesociety.badges where slug = p_slug;

  perform public.ws_audit('badge.delete', jsonb_build_object('badge', p_slug, 'holders', v_holders));
  return jsonb_build_object('ok', true, 'holders_cleared', v_holders);
end $$;

/* ── grants ──────────────────────────────────────────────────────────────── */

revoke all on function public.ws_admin_list_badges()                                    from public;
revoke all on function public.ws_admin_user_badges(uuid)                                from public;
revoke all on function public.ws_admin_grant_badge(uuid, text, text)                    from public;
revoke all on function public.ws_admin_revoke_badge(uuid, text)                         from public;
revoke all on function public.ws_admin_save_badge(text, text, text, text, text, integer, boolean) from public;
revoke all on function public.ws_admin_delete_badge(text)                               from public;

grant execute on function public.ws_admin_list_badges()                                    to authenticated;
grant execute on function public.ws_admin_user_badges(uuid)                                to authenticated;
grant execute on function public.ws_admin_grant_badge(uuid, text, text)                    to authenticated;
grant execute on function public.ws_admin_revoke_badge(uuid, text)                         to authenticated;
grant execute on function public.ws_admin_save_badge(text, text, text, text, text, integer, boolean) to authenticated;
grant execute on function public.ws_admin_delete_badge(text)                               to authenticated;
