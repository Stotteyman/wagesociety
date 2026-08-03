-- Staff access, and keeping Discord and the website telling the same story.
--
-- Two problems this closes.
--
-- 1. Only a superadmin could set anyone's role, so recruiting a helper or a moderator
--    always came back to one person. Admins can now grant roles strictly below their
--    own — an admin can make someone staff or manager, never another admin — and the
--    ladder is enforced in the function, not in the UI.
--
-- 2. The Discord server already carried Staff, Moderator and Director roles, and the
--    website knew nothing about any of them. `discord_role_map` gives each Discord role
--    a website role, and the sync applies it. Only tier roles were ever synced before,
--    which is why someone could be a moderator in Discord and a plain member here.
--
-- The direction of truth is Discord → website for mapped roles only. A role granted by
-- hand keeps `source = 'manual'` and the sync leaves it alone, so the mapping cannot
-- silently undo a deliberate decision. `locked` pins a row against both.

/* ── provenance on role rows ─────────────────────────────────────────────── */

alter table wagesociety.user_roles
  add column if not exists source      text not null default 'manual',
  add column if not exists locked      boolean not null default false,
  add column if not exists assigned_by uuid references wagesociety.profiles(id) on delete set null;

alter table wagesociety.user_roles drop constraint if exists user_roles_source_check;
alter table wagesociety.user_roles add constraint user_roles_source_check
  check (source in ('manual', 'discord'));

/* ── Discord role → website role ─────────────────────────────────────────── */

create table if not exists wagesociety.discord_role_map (
  guild_id     text not null,
  role_id      text not null,
  role_name    text,
  website_role text not null check (website_role in ('staff','manager','admin')),
  -- A badge to hand the holder as well, e.g. Moderator → the `staff` emblem. Null means
  -- the mapping only touches access.
  badge_slug   text references wagesociety.badges(slug) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (guild_id, role_id)
);

alter table wagesociety.discord_role_map enable row level security;

/* ── ladder helper ───────────────────────────────────────────────────────── */

create or replace function public.ws_role_rank(p_role text)
returns integer
language sql immutable
as $$
  select case p_role
           when 'superadmin' then 5 when 'admin' then 4 when 'manager' then 3
           when 'staff' then 2 when 'member' then 1 else 0 end;
$$;

/* ── setting a role ──────────────────────────────────────────────────────── */

create or replace function public.ws_admin_set_role(
  p_user_id uuid, p_role text, p_reason text default null
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety', 'auth'
as $$
declare
  v_caller     text := public.ws_current_role();
  v_caller_r   int  := public.ws_role_rank(v_caller);
  v_target_r   int  := public.ws_role_rank(p_role);
  v_prev       text;
  v_prev_r     int;
  v_locked     boolean;
  v_email      text;
begin
  -- Manager and up may set roles. What they can actually hand out is bounded by the
  -- ladder checks below, so a manager can only ever create staff — which is the point:
  -- recruiting a helper should not need the owner.
  if v_caller_r < 3 then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role not in ('member','staff','manager','admin','superadmin') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_role');
  end if;

  select lower(p.email) into v_email from wagesociety.profiles p where p.id = p_user_id;
  if v_email is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_user');
  end if;
  -- The two hardcoded superadmins are hardcoded precisely so the owner cannot be locked
  -- out. Writing user_roles for them would be theatre, and demoting them a trap.
  if v_email in ('stotteyman@gmail.com','gggiddings@yahoo.com') then
    return jsonb_build_object('ok', false, 'reason', 'protected_account');
  end if;

  select ro.name, ur.locked into v_prev, v_locked
    from wagesociety.user_roles ur join wagesociety.roles ro on ro.id = ur.role_id
   where ur.user_id = p_user_id order by ro.priority desc limit 1;
  v_prev   := coalesce(v_prev, 'member');
  v_prev_r := public.ws_role_rank(v_prev);

  -- You may not grant a role you do not outrank, and you may not touch someone who
  -- already outranks you. A superadmin is exempt from the first rule only so that the
  -- role can be handed on at all.
  if v_target_r >= v_caller_r and not (v_caller = 'superadmin') then
    return jsonb_build_object('ok', false, 'reason', 'above_your_level');
  end if;
  if v_prev_r >= v_caller_r and v_caller <> 'superadmin' then
    return jsonb_build_object('ok', false, 'reason', 'target_outranks_you');
  end if;
  if v_locked and v_caller <> 'superadmin' then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  delete from wagesociety.user_roles where user_id = p_user_id;
  if p_role <> 'member' then
    insert into wagesociety.user_roles (user_id, role_id, source, assigned_by, locked)
    select p_user_id, r.id, 'manual', auth.uid(), coalesce(v_locked, false)
      from wagesociety.roles r where r.name = p_role
    on conflict do nothing;
  end if;

  perform public.ws_audit('role.set', jsonb_build_object(
    'user', p_user_id, 'email', v_email, 'from', v_prev, 'to', p_role,
    'by_role', v_caller, 'reason', p_reason));
  return jsonb_build_object('ok', true, 'role', p_role, 'previous', v_prev);
end $$;

/**
 * Pin someone's role so neither the Discord sync nor another admin can move it.
 * Superadmin only: it is the lever that makes an access decision stick.
 */
create or replace function public.ws_admin_lock_role(p_user_id uuid, p_locked boolean)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
begin
  if public.ws_current_role() <> 'superadmin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update wagesociety.user_roles set locked = coalesce(p_locked, false) where user_id = p_user_id;
  perform public.ws_audit('role.lock', jsonb_build_object('user', p_user_id, 'locked', p_locked));
  return jsonb_build_object('ok', true, 'locked', coalesce(p_locked, false));
end $$;

/* ── the Discord role mapping ────────────────────────────────────────────── */

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
               'updated_at', m.updated_at
             ) order by public.ws_role_rank(m.website_role) desc, m.role_name)
        from wagesociety.discord_role_map m), '[]'::jsonb),
    -- Every role name the guild snapshot has ever seen, so the mapping screen can offer
    -- real roles instead of asking anyone to paste a snowflake.
    'seen_roles', coalesce((
      select jsonb_agg(distinct jsonb_build_object('role_id', rid, 'role_name', rname))
        from (
          select unnest(s.role_ids) rid, unnest(s.role_names) rname
            from wagesociety.discord_role_snapshot s
        ) z where rid is not null), '[]'::jsonb)
  );
end $$;

create or replace function public.ws_admin_set_discord_role_map(
  p_role_id text, p_role_name text, p_website_role text,
  p_badge_slug text default null, p_guild_id text default null
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
declare v_guild text;
begin
  if not public.ws_is_staff('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_guild := coalesce(nullif(btrim(coalesce(p_guild_id,'')),''),
                      (select guild_id from wagesociety.discord_servers order by installed_at limit 1));
  if v_guild is null then
    return jsonb_build_object('ok', false, 'reason', 'no_guild');
  end if;

  -- A null website_role is how the console removes a mapping.
  if p_website_role is null then
    delete from wagesociety.discord_role_map where guild_id = v_guild and role_id = p_role_id;
    perform public.ws_audit('discord.role_map.clear', jsonb_build_object('role_id', p_role_id));
    return jsonb_build_object('ok', true, 'cleared', true);
  end if;

  if p_website_role not in ('staff','manager','admin') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_role');
  end if;
  -- Mapping a Discord role to a website role you cannot grant yourself would be a way
  -- around ws_admin_set_role, so hold it to the same ladder.
  if public.ws_role_rank(p_website_role) >= public.ws_role_rank(public.ws_current_role()) then
    return jsonb_build_object('ok', false, 'reason', 'above_your_level');
  end if;

  insert into wagesociety.discord_role_map (guild_id, role_id, role_name, website_role, badge_slug)
  values (v_guild, p_role_id, nullif(btrim(coalesce(p_role_name,'')),''), p_website_role,
          nullif(btrim(coalesce(p_badge_slug,'')),''))
  on conflict (guild_id, role_id) do update set
    role_name    = excluded.role_name,
    website_role = excluded.website_role,
    badge_slug   = excluded.badge_slug,
    updated_at   = now();

  perform public.ws_audit('discord.role_map.set', jsonb_build_object(
    'role_id', p_role_id, 'role_name', p_role_name, 'website_role', p_website_role,
    'badge', p_badge_slug));
  return jsonb_build_object('ok', true);
end $$;

/* ── the sync itself ─────────────────────────────────────────────────────── */

/**
 * What the sync needs before it calls Discord: the mapping, and who is linked.
 * Service-role only — it returns the Discord id of every linked account.
 */
create or replace function public.ws_svc_staff_sync_context()
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'wagesociety'
as $$
begin
  return jsonb_build_object(
    'guild_id', (select guild_id from wagesociety.discord_servers order by installed_at limit 1),
    'mappings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'role_id', m.role_id, 'website_role', m.website_role,
               'role_name', m.role_name, 'badge_slug', m.badge_slug))
        from wagesociety.discord_role_map m), '[]'::jsonb),
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', d.user_id, 'discord_id', d.discord_id,
               'email', p.email, 'username', p.username,
               'role', coalesce((select ro.name from wagesociety.user_roles ur
                                   join wagesociety.roles ro on ro.id = ur.role_id
                                  where ur.user_id = d.user_id
                                  order by ro.priority desc limit 1), 'member'),
               'source', coalesce((select ur.source from wagesociety.user_roles ur
                                    where ur.user_id = d.user_id limit 1), 'manual'),
               'locked', coalesce((select bool_or(ur.locked) from wagesociety.user_roles ur
                                    where ur.user_id = d.user_id), false)))
        from wagesociety.discord_links d
        join wagesociety.profiles p on p.id = d.user_id), '[]'::jsonb)
  );
end $$;

/**
 * Apply one member's computed role. `p_desired` is the highest website role their mapped
 * Discord roles earn them, or null for none.
 *
 * The rules, in the order they are checked:
 *   locked                        → never touched
 *   protected owner account       → never touched
 *   current role granted by hand  → left alone; Discord does not overrule a decision
 *   desired is null, source discord→ dropped back to member
 *   otherwise                     → set to desired, marked as coming from Discord
 */
create or replace function public.ws_svc_apply_staff_role(
  p_user_id uuid, p_desired text, p_dry_run boolean default false
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
declare
  v_prev text; v_source text; v_locked boolean; v_email text; v_action text;
begin
  select lower(p.email) into v_email from wagesociety.profiles p where p.id = p_user_id;
  if v_email is null then
    return jsonb_build_object('action', 'skip', 'reason', 'unknown_user');
  end if;
  if v_email in ('stotteyman@gmail.com','gggiddings@yahoo.com') then
    return jsonb_build_object('action', 'skip', 'reason', 'protected_account', 'email', v_email);
  end if;

  select ro.name, ur.source, ur.locked into v_prev, v_source, v_locked
    from wagesociety.user_roles ur join wagesociety.roles ro on ro.id = ur.role_id
   where ur.user_id = p_user_id order by ro.priority desc limit 1;
  v_prev   := coalesce(v_prev, 'member');
  v_source := coalesce(v_source, 'manual');

  if coalesce(v_locked, false) then
    return jsonb_build_object('action', 'skip', 'reason', 'locked', 'email', v_email, 'role', v_prev);
  end if;

  if p_desired is null then
    if v_prev = 'member' then
      return jsonb_build_object('action', 'none', 'email', v_email, 'role', 'member');
    end if;
    if v_source <> 'discord' then
      return jsonb_build_object('action', 'skip', 'reason', 'manual_grant', 'email', v_email, 'role', v_prev);
    end if;
    v_action := 'demote';
  elsif p_desired = v_prev then
    return jsonb_build_object('action', 'none', 'email', v_email, 'role', v_prev);
  elsif v_source = 'manual' and v_prev <> 'member'
        and public.ws_role_rank(v_prev) > public.ws_role_rank(p_desired) then
    -- A hand-granted role that outranks what Discord says is a deliberate decision.
    return jsonb_build_object('action', 'skip', 'reason', 'manual_grant', 'email', v_email, 'role', v_prev);
  else
    v_action := case when public.ws_role_rank(coalesce(p_desired,'member')) > public.ws_role_rank(v_prev)
                     then 'promote' else 'demote' end;
  end if;

  if p_dry_run then
    return jsonb_build_object('action', v_action, 'dry_run', true, 'email', v_email,
                              'from', v_prev, 'to', coalesce(p_desired, 'member'));
  end if;

  delete from wagesociety.user_roles where user_id = p_user_id;
  if p_desired is not null and p_desired <> 'member' then
    insert into wagesociety.user_roles (user_id, role_id, source)
    select p_user_id, r.id, 'discord' from wagesociety.roles r where r.name = p_desired
    on conflict do nothing;
  end if;

  perform public.ws_audit('role.discord_sync', jsonb_build_object(
    'user', p_user_id, 'email', v_email, 'from', v_prev, 'to', coalesce(p_desired, 'member')));
  return jsonb_build_object('action', v_action, 'email', v_email,
                            'from', v_prev, 'to', coalesce(p_desired, 'member'));
end $$;

/** Badges the mapping says a member has earned. Idempotent; safe to run every sync. */
create or replace function public.ws_svc_apply_role_badges(p_user_id uuid, p_slugs text[])
returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
declare v_added int := 0;
begin
  insert into wagesociety.user_badges (user_id, badge_slug, note)
  select p_user_id, s, 'Granted by Discord role sync'
    from unnest(coalesce(p_slugs, '{}')) s
   where exists (select 1 from wagesociety.badges b where b.slug = s and b.is_active)
  on conflict do nothing;
  get diagnostics v_added = row_count;
  return jsonb_build_object('added', v_added);
end $$;

/* ── grants ──────────────────────────────────────────────────────────────── */

revoke all on function public.ws_admin_set_role(uuid, text, text)                         from public, anon;
revoke all on function public.ws_admin_lock_role(uuid, boolean)                           from public, anon;
revoke all on function public.ws_admin_discord_role_map()                                 from public, anon;
revoke all on function public.ws_admin_set_discord_role_map(text, text, text, text, text) from public, anon;
revoke all on function public.ws_svc_staff_sync_context()                                 from public, anon, authenticated;
revoke all on function public.ws_svc_apply_staff_role(uuid, text, boolean)                from public, anon, authenticated;
revoke all on function public.ws_svc_apply_role_badges(uuid, text[])                      from public, anon, authenticated;

grant execute on function public.ws_role_rank(text)                                       to authenticated, anon;
grant execute on function public.ws_admin_set_role(uuid, text, text)                      to authenticated;
grant execute on function public.ws_admin_lock_role(uuid, boolean)                        to authenticated;
grant execute on function public.ws_admin_discord_role_map()                              to authenticated;
grant execute on function public.ws_admin_set_discord_role_map(text, text, text, text, text) to authenticated;
grant execute on function public.ws_svc_staff_sync_context()                              to service_role;
grant execute on function public.ws_svc_apply_staff_role(uuid, text, boolean)             to service_role;
grant execute on function public.ws_svc_apply_role_badges(uuid, text[])                   to service_role;

-- The one-argument signature is gone: ws_admin_set_role now takes a reason. Leaving the
-- old one callable would let a stale bundle write roles under the pre-ladder rules.
drop function if exists public.ws_admin_set_role(uuid, text);
