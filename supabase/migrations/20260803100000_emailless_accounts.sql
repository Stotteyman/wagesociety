-- An account with no email address is still an account.
--
-- Four functions written today decided whether someone exists like this:
--
--   select lower(p.email) into v_email from profiles p where p.id = p_user_id;
--   if v_email is null then return 'unknown_user'; end if;
--
-- which conflates "no such person" with "person has no email". Discord does not always
-- release an email address — the privacy policy says so, the login page says so, and at
-- least one member here has none — so those accounts could not be given a role, could not
-- be suspended, and were skipped by the Discord staff sync entirely.
--
-- It was found by previewing the staff sync: a member holding the Moderator role in
-- Discord came back as `unknown_user` and was silently passed over, which looks exactly
-- like a member who simply had nothing to change.
--
-- Existence is now decided by the primary key, and the email is only ever used for the
-- audit record and the protected-owner check, both of which cope with null.

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
  v_exists     boolean;
begin
  if v_caller_r < 3 then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role not in ('member','staff','manager','admin','superadmin') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_role');
  end if;

  select true, lower(p.email) into v_exists, v_email
    from wagesociety.profiles p where p.id = p_user_id;
  if not coalesce(v_exists, false) then
    return jsonb_build_object('ok', false, 'reason', 'unknown_user');
  end if;
  if v_email in ('stotteyman@gmail.com','gggiddings@yahoo.com') then
    return jsonb_build_object('ok', false, 'reason', 'protected_account');
  end if;

  select ro.name, ur.locked into v_prev, v_locked
    from wagesociety.user_roles ur join wagesociety.roles ro on ro.id = ur.role_id
   where ur.user_id = p_user_id order by ro.priority desc limit 1;
  v_prev   := coalesce(v_prev, 'member');
  v_prev_r := public.ws_role_rank(v_prev);

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

create or replace function public.ws_admin_suspend(p_user_id uuid, p_suspended boolean)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety', 'auth'
as $$
declare
  v_caller   text := public.ws_current_role();
  v_caller_r int  := public.ws_role_rank(v_caller);
  v_email    text;
  v_exists   boolean;
  v_target_r int;
begin
  if v_caller_r < 3 then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select true, lower(p.email) into v_exists, v_email
    from wagesociety.profiles p where p.id = p_user_id;
  if not coalesce(v_exists, false) then
    return jsonb_build_object('ok', false, 'reason', 'unknown_user');
  end if;
  if v_email in ('stotteyman@gmail.com','gggiddings@yahoo.com') then
    return jsonb_build_object('ok', false, 'reason', 'protected_account');
  end if;

  v_target_r := public.ws_role_rank(coalesce((
    select ro.name from wagesociety.user_roles ur
      join wagesociety.roles ro on ro.id = ur.role_id
     where ur.user_id = p_user_id order by ro.priority desc limit 1), 'member'));

  if v_target_r >= v_caller_r and v_caller <> 'superadmin' then
    return jsonb_build_object('ok', false, 'reason', 'target_outranks_you');
  end if;

  update wagesociety.profiles set is_suspended = p_suspended where id = p_user_id;

  perform public.ws_audit(
    case when p_suspended then 'suspend' else 'unsuspend' end,
    jsonb_build_object('user', p_user_id, 'email', v_email, 'by_role', v_caller));
  return jsonb_build_object('ok', true, 'suspended', p_suspended);
end $$;

create or replace function public.ws_svc_apply_staff_role(
  p_user_id uuid, p_desired text, p_dry_run boolean default false
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
declare
  v_prev text; v_source text; v_locked boolean; v_email text; v_action text; v_exists boolean;
begin
  select true, lower(p.email) into v_exists, v_email
    from wagesociety.profiles p where p.id = p_user_id;
  if not coalesce(v_exists, false) then
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

revoke all on function public.ws_admin_set_role(uuid, text, text)           from public, anon;
revoke all on function public.ws_admin_suspend(uuid, boolean)               from public, anon;
revoke all on function public.ws_svc_apply_staff_role(uuid, text, boolean)  from public, anon, authenticated;
grant execute on function public.ws_admin_set_role(uuid, text, text)        to authenticated;
grant execute on function public.ws_admin_suspend(uuid, boolean)            to authenticated;
grant execute on function public.ws_svc_apply_staff_role(uuid, text, boolean) to service_role;
