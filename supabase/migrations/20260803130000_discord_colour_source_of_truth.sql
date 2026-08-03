-- Discord decides what colour everything is.
--
-- The server is where these roles are designed — somebody picks the colour in Discord's
-- role editor — so the website matches it rather than keeping a second opinion. Colours
-- are pulled FROM Discord onto the badges that mirror those roles, onto the staff
-- mappings and onto the tier mappings.
--
-- This runs the opposite way to the badge->role push in discord-staff-sync, deliberately:
-- Discord owns how things look, the website owns who holds what.
--
-- The readability floor is the part worth keeping. A badge is FILLED with its colour and
-- the page ink is #06090B, so pulling a near-black role through produces an emblem that
-- is simply not there. That happened on the first run — the OG role is #010000 and the
-- OG badge vanished — and it reads as a broken render rather than a design choice.
-- Unusable colours are now skipped and reported by name so they can be fixed at source.

alter table wagesociety.discord_role_map      add column if not exists color text;
alter table wagesociety.discord_tier_role_map add column if not exists color text;

alter table wagesociety.discord_role_map drop constraint if exists discord_role_map_color_check;
alter table wagesociety.discord_role_map add constraint discord_role_map_color_check
  check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');

alter table wagesociety.discord_tier_role_map drop constraint if exists discord_tier_role_map_color_check;
alter table wagesociety.discord_tier_role_map add constraint discord_tier_role_map_color_check
  check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');

/** Perceived brightness, 0-255. Green dominates because the eye does. */
create or replace function wagesociety.color_luminance(p_hex text)
returns numeric
language sql immutable
set search_path to 'pg_catalog'
as $$
  select 0.2126 * ('x' || substr(p_hex, 2, 2))::bit(8)::int
       + 0.7152 * ('x' || substr(p_hex, 4, 2))::bit(8)::int
       + 0.0722 * ('x' || substr(p_hex, 6, 2))::bit(8)::int;
$$;

/**
 * Apply the colours Discord reports. p_roles is [{role_id, name, color}] straight from
 * GET /guilds/{id}/roles.
 */
create or replace function public.ws_svc_apply_discord_colors(p_roles jsonb)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
declare v_map int := 0; v_tier int := 0; v_badge int := 0; v_skipped jsonb;
begin
  create temp table _incoming on commit drop as
  select r->>'role_id' as role_id,
         r->>'name'    as name,
         upper(r->>'color') as color
    from jsonb_array_elements(coalesce(p_roles, '[]'::jsonb)) r
   where r->>'color' ~ '^#[0-9A-Fa-f]{6}$';

  -- Discord uses 0 for "no colour set" (the role inherits grey), which is not a choice.
  -- The luminance floor catches the rest: 45/255 is about where a fill stops reading
  -- against #06090B.
  select coalesce(jsonb_agg(jsonb_build_object('role', name, 'color', color)), '[]'::jsonb)
    into v_skipped
    from _incoming
   where color = '#000000' or wagesociety.color_luminance(color) < 45;

  delete from _incoming
   where color = '#000000' or wagesociety.color_luminance(color) < 45;

  update wagesociety.discord_role_map m set color = i.color, updated_at = now()
    from _incoming i where m.role_id = i.role_id and m.color is distinct from i.color;
  get diagnostics v_map = row_count;

  update wagesociety.discord_tier_role_map t set color = i.color, updated_at = now()
    from _incoming i where t.role_id = i.role_id and t.color is distinct from i.color;
  get diagnostics v_tier = row_count;

  -- The badge takes the colour of the Discord role it mirrors. This is the point: the
  -- Founder emblem on a profile is the colour of the Founder role in the member list,
  -- with nobody maintaining both.
  update wagesociety.badges b set color = i.color, updated_at = now()
    from _incoming i where b.discord_role_id = i.role_id and b.color is distinct from i.color;
  get diagnostics v_badge = row_count;

  perform public.ws_audit('discord.colors', jsonb_build_object(
    'role_map', v_map, 'tier_map', v_tier, 'badges', v_badge, 'skipped', v_skipped));

  return jsonb_build_object('ok', true, 'role_map', v_map, 'tier_map', v_tier,
                            'badges', v_badge, 'skipped', v_skipped);
end $$;

-- The console renders chips in these colours, so they have to come back out again.
create or replace function public.ws_admin_discord_role_map()
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'wagesociety'
as $$
begin
  if not public.ws_is_staff('manager') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'guild_id', (select guild_id from wagesociety.discord_servers order by installed_at limit 1),
    'mappings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'guild_id', m.guild_id, 'role_id', m.role_id, 'role_name', m.role_name,
               'website_role', m.website_role, 'badge_slug', m.badge_slug,
               'color', m.color, 'updated_at', m.updated_at
             ) order by public.ws_role_rank(m.website_role) desc, m.role_name)
        from wagesociety.discord_role_map m), '[]'::jsonb),
    'tiers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'tier_slug', t.tier_slug, 'role_id', t.role_id,
               'role_name', t.role_name, 'color', t.color) order by t.tier_slug)
        from wagesociety.discord_tier_role_map t), '[]'::jsonb),
    'seen_roles', coalesce((
      select jsonb_agg(distinct jsonb_build_object('role_id', rid, 'role_name', rname))
        from (
          select unnest(s.role_ids) rid, unnest(s.role_names) rname
            from wagesociety.discord_role_snapshot s
        ) z where rid is not null), '[]'::jsonb)
  );
end $$;

/* ── the glyph reaches the admin user panel too ──────────────────────────── */

-- 20260803030000 created this before badges had a glyph. Replaying the folder without
-- this would leave the admin user panel drawing bare silhouettes.
create or replace function public.ws_admin_user_detail(p_user_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'wagesociety', 'auth'
as $$
declare v_role text;
begin
  if not public.ws_is_staff('staff') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_role := public.ws_current_role();

  return (
    select jsonb_build_object(
      'id', p.id, 'email', p.email, 'username', p.username, 'display_name', p.display_name,
      'avatar_url', p.avatar_url, 'bio', p.bio, 'tier', p.tier,
      'suspended', p.is_suspended, 'created_at', p.created_at, 'last_seen_at', p.last_seen_at,
      'points', p.referral_points, 'referral_code', p.referral_code,
      'total_referrals', p.total_referrals, 'referral_tier', p.referral_tier,
      'primary_platform', p.primary_platform, 'social_links', p.social_links,
      'role', coalesce((select ro.name from wagesociety.user_roles ur
                          join wagesociety.roles ro on ro.id = ur.role_id
                         where ur.user_id = p.id order by ro.priority desc limit 1), 'member'),
      'role_source', (select ur.source from wagesociety.user_roles ur where ur.user_id = p.id limit 1),
      'role_locked', coalesce((select bool_or(ur.locked) from wagesociety.user_roles ur
                                where ur.user_id = p.id), false),
      'role_assigned_at', (select max(ur.assigned_at) from wagesociety.user_roles ur where ur.user_id = p.id),
      'can_manage', public.ws_role_rank(v_role) >= 3
                    and lower(p.email) is distinct from 'stotteyman@gmail.com'
                    and lower(p.email) is distinct from 'gggiddings@yahoo.com'
                    and (v_role = 'superadmin'
                         or public.ws_role_rank(coalesce((select ro.name from wagesociety.user_roles ur
                              join wagesociety.roles ro on ro.id = ur.role_id
                             where ur.user_id = p.id order by ro.priority desc limit 1), 'member'))
                            < public.ws_role_rank(v_role)),
      'protected', lower(p.email) in ('stotteyman@gmail.com','gggiddings@yahoo.com'),
      'permissions', (select coalesce(jsonb_agg(distinct pe.key), '[]'::jsonb)
                        from wagesociety.user_roles ur
                        join wagesociety.role_permissions rp on rp.role_id = ur.role_id
                        join wagesociety.permissions pe on pe.id = rp.permission_id
                       where ur.user_id = p.id),
      'badges', (select coalesce(jsonb_agg(jsonb_build_object(
                          'slug', b.slug, 'label', b.label, 'color', b.color,
                          'shape', b.shape, 'glyph', b.glyph,
                          'granted_at', ub.granted_at, 'note', ub.note,
                          'granted_by', (select g.email from wagesociety.profiles g where g.id = ub.granted_by)
                        ) order by b.sort_order), '[]'::jsonb)
                   from wagesociety.user_badges ub
                   join wagesociety.badges b on b.slug = ub.badge_slug
                  where ub.user_id = p.id),
      'discord', (select jsonb_build_object(
                    'discord_id', d.discord_id, 'username', d.username, 'linked_at', d.linked_at,
                    'roles', coalesce((select s.role_names from wagesociety.discord_role_snapshot s
                                        where s.discord_id = d.discord_id), '{}'))
                    from wagesociety.discord_links d where d.user_id = p.id),
      'connections', (select coalesce(jsonb_agg(jsonb_build_object(
                        'provider', o.provider, 'handle', o.display_name,
                        'linked_at', o.linked_at)), '[]'::jsonb)
                        from wagesociety.oauth_connections o where o.user_id = p.id),
      'memberships', (select coalesce(jsonb_agg(jsonb_build_object(
                        'plan', m.plan_slug, 'status', m.status, 'cycle', m.billing_cycle,
                        'trial_ends_at', m.trial_ends_at, 'period_end', m.current_period_end,
                        'cancel_at_period_end', m.cancel_at_period_end, 'source', m.source)), '[]'::jsonb)
                        from wagesociety.user_memberships m where m.user_id = p.id),
      'application', (select jsonb_build_object(
                        'id', a.id, 'position', a.position_slug, 'status', a.status,
                        'created_at', a.created_at, 'answers', a.answers, 'review_note', a.review_note)
                        from wagesociety.staff_applications a
                       where a.user_id = p.id order by a.created_at desc limit 1),
      'onboarding', (select coalesce(jsonb_agg(jsonb_build_object(
                        'slug', t.slug, 'title', t.title, 'detail', t.detail,
                        'required', t.is_required, 'done_at', pr.done_at) order by t.sort_order), '[]'::jsonb)
                        from wagesociety.staff_onboarding_progress pr
                        join wagesociety.staff_onboarding_tasks t on t.slug = pr.task_slug
                       where pr.user_id = p.id and t.is_active),
      'history', (select coalesce(jsonb_agg(jsonb_build_object(
                    'action', al.action, 'actor', al.actor, 'at', al.created_at,
                    'detail', al.detail) order by al.created_at desc), '[]'::jsonb)
                    from (select * from wagesociety.admin_audit_log l
                           where l.detail->>'user' = p.id::text
                           order by l.created_at desc limit 20) al)
    )
    from wagesociety.profiles p where p.id = p_user_id
  );
end $$;

revoke all on function public.ws_svc_apply_discord_colors(jsonb) from public, anon, authenticated;
revoke all on function public.ws_admin_discord_role_map()        from public, anon;
revoke all on function public.ws_admin_user_detail(uuid)         from public, anon;
grant execute on function public.ws_svc_apply_discord_colors(jsonb) to service_role;
grant execute on function public.ws_admin_discord_role_map()        to authenticated;
grant execute on function public.ws_admin_user_detail(uuid)         to authenticated;

-- The colour the first, unguarded run should never have taken. #E43000 is what the OG
-- badge was created with and what the brand guide gives it.
update wagesociety.badges set color = '#E43000' where slug = 'og' and color = '#010000';
