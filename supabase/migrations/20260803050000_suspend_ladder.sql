-- Suspension gets the same ladder every other access decision has.
--
-- ws_admin_suspend was written when the only people in the admin area were the two
-- owners, and it shows: any admin could suspend anyone, including a superadmin, and
-- including the hardcoded owner accounts. Since a suspended profile is filtered out of
-- public.wagesociety_creators and out of the site generally, that is a lockout waiting
-- to happen, and it is exactly the sort of thing an account taken over for an hour would
-- reach for.
--
-- It also drops from admin to manager. Acting on a report is what a moderator is for,
-- and the whole point of the staff pipeline is that moderation does not queue behind the
-- owner. The ladder below is what makes that safe: a manager can suspend a member, and
-- cannot touch another manager.
--
-- ws_admin_set_tier deliberately does NOT move. A tier is a paid entitlement — handing
-- one out is a billing decision, not a moderation one — so it stays at admin, and the
-- Users panel disables the control rather than letting the button throw.

create or replace function public.ws_admin_suspend(p_user_id uuid, p_suspended boolean)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety', 'auth'
as $$
declare
  v_caller   text := public.ws_current_role();
  v_caller_r int  := public.ws_role_rank(v_caller);
  v_email    text;
  v_target_r int;
begin
  if v_caller_r < 3 then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select lower(p.email) into v_email from wagesociety.profiles p where p.id = p_user_id;
  if v_email is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_user');
  end if;
  if v_email in ('stotteyman@gmail.com','gggiddings@yahoo.com') then
    return jsonb_build_object('ok', false, 'reason', 'protected_account');
  end if;

  v_target_r := public.ws_role_rank(coalesce((
    select ro.name from wagesociety.user_roles ur
      join wagesociety.roles ro on ro.id = ur.role_id
     where ur.user_id = p_user_id order by ro.priority desc limit 1), 'member'));

  -- Suspending someone who outranks you is the cheapest way to remove a superior, so it
  -- is held to the same rule as demoting them.
  if v_target_r >= v_caller_r and v_caller <> 'superadmin' then
    return jsonb_build_object('ok', false, 'reason', 'target_outranks_you');
  end if;

  update wagesociety.profiles set is_suspended = p_suspended where id = p_user_id;

  perform public.ws_audit(
    case when p_suspended then 'suspend' else 'unsuspend' end,
    jsonb_build_object('user', p_user_id, 'email', v_email, 'by_role', v_caller));
  return jsonb_build_object('ok', true, 'suspended', p_suspended);
end $$;

revoke all on function public.ws_admin_suspend(uuid, boolean) from public, anon;
grant execute on function public.ws_admin_suspend(uuid, boolean) to authenticated;

/* ── reopening a closed application ──────────────────────────────────────── */

-- staff_applications_one_open is a partial unique index over open statuses. Moving a
-- rejected application back to 'reviewing' when the applicant has since applied again
-- violates it, and a raw 23505 reaches the console as unreadable Postgres text. Say what
-- happened instead.
create or replace function public.ws_admin_staff_decide(
  p_id uuid, p_status text, p_note text default null
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
declare
  v_app      wagesociety.staff_applications%rowtype;
  v_pos      wagesociety.staff_positions%rowtype;
  v_role_res jsonb;
  v_seeded   int := 0;
begin
  if not public.ws_is_staff('manager') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('submitted','reviewing','interview','hired','rejected','withdrawn') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_status');
  end if;

  select * into v_app from wagesociety.staff_applications where id = p_id;
  if v_app.id is null then return jsonb_build_object('ok', false, 'reason', 'unknown_application'); end if;
  select * into v_pos from wagesociety.staff_positions where slug = v_app.position_slug;

  begin
    update wagesociety.staff_applications set
      status      = p_status,
      review_note = coalesce(nullif(btrim(coalesce(p_note,'')),''), review_note),
      reviewer_id = auth.uid(),
      decided_at  = case when p_status in ('hired','rejected','withdrawn') then now() else decided_at end
    where id = p_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_has_open_application');
  end;

  if p_status = 'hired' then
    -- Reuses ws_admin_set_role, so the same ladder applies: a manager cannot hire
    -- someone into a position that outranks them.
    v_role_res := public.ws_admin_set_role(v_app.user_id, v_pos.website_role,
                                           'hired as ' || v_pos.title);
    if not coalesce((v_role_res->>'ok')::boolean, false) then
      -- Put the application back exactly as it was rather than leave a hire with no
      -- access. reviewer_id and review_note are restored too, so a failed attempt does
      -- not silently claim someone reviewed it.
      update wagesociety.staff_applications set
        status = v_app.status, decided_at = v_app.decided_at,
        reviewer_id = v_app.reviewer_id, review_note = v_app.review_note
       where id = p_id;
      return jsonb_build_object('ok', false, 'reason', v_role_res->>'reason');
    end if;

    if v_pos.badge_slug is not null then
      insert into wagesociety.user_badges (user_id, badge_slug, granted_by, note)
      values (v_app.user_id, v_pos.badge_slug, auth.uid(), 'Hired as ' || v_pos.title)
      on conflict (user_id, badge_slug) do nothing;
    end if;

    insert into wagesociety.staff_onboarding_progress (user_id, task_slug)
    select v_app.user_id, t.slug
      from wagesociety.staff_onboarding_tasks t
     where t.is_active and (t.position_slug is null or t.position_slug = v_pos.slug)
    on conflict do nothing;
    get diagnostics v_seeded = row_count;
  end if;

  perform public.ws_audit('staff.decide', jsonb_build_object(
    'application', p_id, 'user', v_app.user_id, 'position', v_app.position_slug,
    'from', v_app.status, 'to', p_status, 'note', p_note));
  return jsonb_build_object('ok', true, 'status', p_status, 'tasks_seeded', v_seeded);
end $$;

revoke all on function public.ws_admin_staff_decide(uuid, text, text) from public, anon;
grant execute on function public.ws_admin_staff_decide(uuid, text, text) to authenticated;
