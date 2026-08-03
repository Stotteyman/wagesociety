-- Pushing badges out to Discord.
--
-- The staff sync pulls Discord → website. This is the other half: a badge held on the
-- website should show as its Discord role, so a Founder is a Founder in both places and
-- an OG can be seen in the member list.
--
-- It is deliberately **additive**. It never removes a role it did not just decide someone
-- should have, and there is no reconciliation pass that strips anything. Badges are
-- permanent honours; a bulk removal pass that gets its input wrong once takes Founder off
-- the founders, and nobody would notice until they looked. Removal happens only at the
-- moment a badge is revoked in the console, where it is one person, one role, and an
-- explicit decision.

/** Every linked member, with the badge roles they have earned. */
create or replace function public.ws_svc_badge_role_targets(p_user_id uuid default null)
returns jsonb
language sql stable security definer
set search_path to 'public', 'wagesociety'
as $$
  select coalesce(jsonb_agg(t), '[]'::jsonb) from (
    select jsonb_build_object(
             'user_id',    d.user_id,
             'discord_id', d.discord_id,
             'username',   p.username,
             'role_ids',   jsonb_agg(distinct b.discord_role_id),
             'badges',     jsonb_agg(distinct b.slug)
           ) as t
      from wagesociety.discord_links d
      join wagesociety.profiles p     on p.id = d.user_id
      join wagesociety.user_badges ub on ub.user_id = d.user_id
      join wagesociety.badges b       on b.slug = ub.badge_slug
     where b.is_active
       and b.discord_role_id is not null
       and (p_user_id is null or d.user_id = p_user_id)
     group by d.user_id, d.discord_id, p.username
  ) z;
$$;

/** The Discord role a single badge mirrors, for the grant/revoke path. */
create or replace function public.ws_svc_badge_role(p_slug text)
returns text
language sql stable security definer
set search_path to 'public', 'wagesociety'
as $$
  select discord_role_id from wagesociety.badges where slug = p_slug and is_active;
$$;

/**
 * Granting a badge now also settles what the badge is worth, so a tier floor can never
 * be forgotten. The Discord role is returned rather than written: this function has no
 * bot token, and the caller (the browser, via /api/discord-staff-sync) does.
 */
create or replace function public.ws_admin_grant_badge(
  p_user_id uuid, p_slug text, p_note text default null
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
declare v_label text; v_email text; v_role text; v_ent jsonb;
begin
  if not public.ws_has_permission('manage_badges') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select label, discord_role_id into v_label, v_role
    from wagesociety.badges where slug = p_slug and is_active;
  if v_label is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_badge');
  end if;
  select email into v_email from wagesociety.profiles where id = p_user_id;
  if v_email is null and not exists (select 1 from wagesociety.profiles where id = p_user_id) then
    return jsonb_build_object('ok', false, 'reason', 'unknown_user');
  end if;

  insert into wagesociety.user_badges (user_id, badge_slug, granted_by, note)
  values (p_user_id, p_slug, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (user_id, badge_slug) do update
     set note = excluded.note, granted_by = excluded.granted_by;

  v_ent := public.ws_svc_apply_badge_entitlements(p_user_id);

  perform public.ws_audit('badge.grant', jsonb_build_object(
    'user', p_user_id, 'email', v_email, 'badge', p_slug, 'note', p_note));
  return jsonb_build_object('ok', true, 'badge', p_slug, 'label', v_label,
                            'discord_role_id', v_role, 'entitlement', v_ent);
end $$;

/**
 * Revoking takes the Discord role back too — the one place removal is safe, because it
 * is one person and someone just decided it.
 *
 * The tier is deliberately NOT lowered. Dropping someone's plan as a side effect of
 * removing a badge is the kind of surprise that reads as a billing fault, and an OG who
 * has since paid for Elite should keep it. Adjust the tier explicitly if that is meant.
 */
create or replace function public.ws_admin_revoke_badge(p_user_id uuid, p_slug text)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
declare v_email text; v_hit int; v_role text;
begin
  if not public.ws_has_permission('manage_badges') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select email into v_email from wagesociety.profiles where id = p_user_id;
  select discord_role_id into v_role from wagesociety.badges where slug = p_slug;

  delete from wagesociety.user_badges where user_id = p_user_id and badge_slug = p_slug;
  get diagnostics v_hit = row_count;
  if v_hit = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_held');
  end if;

  perform public.ws_audit('badge.revoke', jsonb_build_object(
    'user', p_user_id, 'email', v_email, 'badge', p_slug));
  return jsonb_build_object('ok', true, 'badge', p_slug, 'discord_role_id', v_role);
end $$;

revoke all on function public.ws_svc_badge_role_targets(uuid) from public, anon, authenticated;
revoke all on function public.ws_svc_badge_role(text)         from public, anon, authenticated;
revoke all on function public.ws_admin_grant_badge(uuid, text, text) from public, anon;
revoke all on function public.ws_admin_revoke_badge(uuid, text)      from public, anon;

grant execute on function public.ws_svc_badge_role_targets(uuid) to service_role;
grant execute on function public.ws_svc_badge_role(text)         to service_role;
grant execute on function public.ws_admin_grant_badge(uuid, text, text) to authenticated;
grant execute on function public.ws_admin_revoke_badge(uuid, text)      to authenticated;

-- The catalog screen shows what a badge is worth, not just what it looks like, so the
-- entitlement columns have to come back with it.
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
             'floor_tier', b.floor_tier, 'discount_tier', b.discount_tier,
             'discord_role_id', b.discord_role_id,
             'holders', (select count(*) from wagesociety.user_badges ub where ub.badge_slug = b.slug)
           ) order by b.sort_order, b.slug)
      from wagesociety.badges b
  ), '[]'::jsonb);
end $$;

revoke all on function public.ws_admin_list_badges() from public, anon;
grant execute on function public.ws_admin_list_badges() to authenticated;
