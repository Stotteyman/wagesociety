-- One call behind the admin user panel.
--
-- ws_admin_user_detail already existed but returned about half of what a manager needs
-- when they open somebody: no badges, no points, no idea whether a role came from
-- Discord or was granted by hand, no sight of a staff application or onboarding. The
-- panel would otherwise fire six RPCs and stitch them together in the browser, which is
-- both slower and a place for the numbers to disagree with each other.
--
-- Also widens ws_admin_list_users, which was admin-only and so invisible to the very
-- managers who are now allowed to grant a staff role.

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
      -- Whether the caller is allowed to move this person, worked out here so the panel
      -- does not have to reimplement the ladder and get it subtly wrong.
      'can_manage', public.ws_role_rank(v_role) >= 3
                    and lower(p.email) not in ('stotteyman@gmail.com','gggiddings@yahoo.com')
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
                          'slug', b.slug, 'label', b.label, 'color', b.color, 'shape', b.shape,
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

      -- The trail for this one person, so a decision can be explained without going to
      -- the Audit tab and reading everything.
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

-- Managers may now grant a staff role, so they have to be able to find someone first.
-- The search stays the same; only the floor moves.
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
                            'slug', b.slug, 'label', b.label, 'color', b.color, 'shape', b.shape)
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

revoke all on function public.ws_admin_user_detail(uuid)  from public, anon;
revoke all on function public.ws_admin_list_users(text)   from public, anon;
grant execute on function public.ws_admin_user_detail(uuid) to authenticated;
grant execute on function public.ws_admin_list_users(text)  to authenticated;
