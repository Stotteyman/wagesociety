-- Recruiting and onboarding staff — helpers, moderators, and whoever comes next.
--
-- Before this, becoming staff meant someone typing a role into the admin panel. There
-- was no record of who asked, who decided, or what a new moderator was supposed to do
-- in their first week. This gives the whole thing a spine:
--
--   staff_positions            what roles are open, and what each one actually is
--   staff_applications         who asked, what they answered, where it got to
--   staff_onboarding_tasks     the checklist a new hire works through
--   staff_onboarding_progress  which of those they have done
--
-- Hiring is one call. ws_admin_staff_decide(..., 'hired') grants the website role,
-- hands over the badge the position carries, and seeds that person's checklist, so the
-- three things that used to be remembered separately cannot drift apart.

/* ── positions ───────────────────────────────────────────────────────────── */

create table if not exists wagesociety.staff_positions (
  slug             text primary key check (slug ~ '^[a-z][a-z0-9_]{1,39}$'),
  title            text not null,
  blurb            text not null default '',
  responsibilities text[] not null default '{}',
  requirements     text[] not null default '{}',
  time_commitment  text,
  -- What being hired into this position grants.
  website_role     text not null default 'staff' check (website_role in ('staff','manager','admin')),
  badge_slug       text references wagesociety.badges(slug) on delete set null,
  discord_role_id  text,
  is_open          boolean not null default true,
  sort_order       integer not null default 100,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

/* ── applications ────────────────────────────────────────────────────────── */

create table if not exists wagesociety.staff_applications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references wagesociety.profiles(id) on delete cascade,
  position_slug text not null references wagesociety.staff_positions(slug) on delete restrict,
  -- Free-form so the questions can change without a migration. The application form
  -- decides the keys; the console renders whatever is there.
  answers       jsonb not null default '{}'::jsonb,
  status        text not null default 'submitted'
                  check (status in ('submitted','reviewing','interview','hired','rejected','withdrawn')),
  review_note   text,
  reviewer_id   uuid references wagesociety.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  decided_at    timestamptz
);

-- One live application per person. Closed ones stay as history, which is why the index
-- is partial rather than a plain unique on (user_id).
create unique index if not exists staff_applications_one_open
  on wagesociety.staff_applications (user_id)
  where status in ('submitted','reviewing','interview');

create index if not exists staff_applications_status_idx
  on wagesociety.staff_applications (status, created_at desc);

/* ── onboarding checklist ────────────────────────────────────────────────── */

create table if not exists wagesociety.staff_onboarding_tasks (
  slug          text primary key check (slug ~ '^[a-z][a-z0-9_]{1,39}$'),
  title         text not null,
  detail        text not null default '',
  -- null means every position gets it.
  position_slug text references wagesociety.staff_positions(slug) on delete cascade,
  is_required   boolean not null default true,
  is_active     boolean not null default true,
  sort_order    integer not null default 100,
  created_at    timestamptz not null default now()
);

create table if not exists wagesociety.staff_onboarding_progress (
  user_id   uuid not null references wagesociety.profiles(id) on delete cascade,
  task_slug text not null references wagesociety.staff_onboarding_tasks(slug) on delete cascade,
  done_at   timestamptz,
  done_by   uuid references wagesociety.profiles(id) on delete set null,
  note      text,
  primary key (user_id, task_slug)
);

alter table wagesociety.staff_positions           enable row level security;
alter table wagesociety.staff_applications        enable row level security;
alter table wagesociety.staff_onboarding_tasks    enable row level security;
alter table wagesociety.staff_onboarding_progress enable row level security;

create or replace function wagesociety.staff_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists staff_positions_touch on wagesociety.staff_positions;
create trigger staff_positions_touch before update on wagesociety.staff_positions
  for each row execute function wagesociety.staff_touch_updated_at();

drop trigger if exists staff_applications_touch on wagesociety.staff_applications;
create trigger staff_applications_touch before update on wagesociety.staff_applications
  for each row execute function wagesociety.staff_touch_updated_at();

/* ── seed ────────────────────────────────────────────────────────────────── */

insert into wagesociety.staff_positions
  (slug, title, blurb, responsibilities, requirements, time_commitment, website_role, badge_slug, sort_order)
values
  ('helper', 'Helper',
   'The first friendly face. Helpers answer questions in Discord, welcome new members and point people at the right channel.',
   array[
     'Answer questions in the help channels',
     'Welcome new members and walk them through verification',
     'Flag anything that needs a moderator'
   ],
   array[
     'Member for at least 30 days',
     'Discord linked and verified',
     'Around most days, even if only briefly'
   ],
   'A few hours a week', 'staff', 'staff', 10),
  ('moderator', 'Moderator',
   'Keeps the server safe and civil. Moderators act on reports, apply the rules evenly, and write down what they did.',
   array[
     'Act on reports and rule breaks',
     'Issue warnings, mutes and bans within the published rules',
     'Log every action so the next moderator has context'
   ],
   array[
     'Member for at least 60 days, or a former helper',
     'Calm under pressure and consistent',
     'Comfortable saying no'
   ],
   '5-10 hours a week', 'staff', 'staff', 20),
  ('community_manager', 'Community Manager',
   'Runs events, keeps the calendar full and makes sure the community has something to turn up for.',
   array[
     'Plan and run community events',
     'Coordinate with creators on collabs and streams',
     'Keep announcements current'
   ],
   array[
     'Active in the community for 90 days',
     'Organised, and able to follow through on a plan',
     'Happy to speak publicly'
   ],
   '8-12 hours a week', 'manager', 'staff', 30),
  ('content_editor', 'Content Editor',
   'Owns the blog and the FAQ — writes, edits, and keeps published copy honest.',
   array[
     'Write and edit blog posts',
     'Keep the FAQ accurate as the platform changes',
     'Proofread announcements before they go out'
   ],
   array[
     'Can write clearly in the house voice',
     'Careful with detail',
     'Reliable turnaround'
   ],
   '4-8 hours a week', 'staff', 'staff', 40)
on conflict (slug) do nothing;

insert into wagesociety.staff_onboarding_tasks (slug, title, detail, position_slug, is_required, sort_order)
values
  ('read_handbook',   'Read the staff handbook',
   'The rules you will be enforcing, and how we expect them to be enforced.', null, true, 10),
  ('accept_conduct',  'Agree to the staff code of conduct',
   'Confidentiality, conflicts of interest, and what happens if either is broken.', null, true, 20),
  ('discord_linked',  'Discord linked and verified on the website',
   'Roles are synced from Discord, so an unlinked account cannot be given access.', null, true, 30),
  ('two_factor',      'Two-factor enabled on Discord',
   'A staff account is worth taking. Discord requires 2FA for moderation actions anyway.', null, true, 40),
  ('intro_call',      'Intro call with a manager',
   'Half an hour. Who does what, where to ask for help, what to escalate.', null, true, 50),
  ('shadow_shift',    'Shadow an existing staff member',
   'One session watching how reports are actually handled before acting on any.', null, true, 60),
  ('tools_tour',      'Tour of the admin console',
   'What each tab does, and which buttons are one-way.', null, false, 70),
  ('mod_rules',       'Moderation ladder walkthrough',
   'Warn, mute, kick, ban — when each applies and what must be logged.', 'moderator', true, 80),
  ('first_event',     'Co-run one event',
   'Shadow a community event end to end before running one alone.', 'community_manager', true, 90),
  ('style_guide',     'Read the brand and voice guide',
   'docs/BRAND_GUIDE.md — tone, capitalisation, and what we never say.', 'content_editor', true, 100)
on conflict (slug) do nothing;

/* ── public read ─────────────────────────────────────────────────────────── */

/** Open positions, for the public apply page. Deliberately reachable while signed out. */
create or replace function public.ws_staff_openings()
returns jsonb
language sql stable security definer
set search_path to 'public', 'wagesociety'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'slug', p.slug, 'title', p.title, 'blurb', p.blurb,
           'responsibilities', p.responsibilities, 'requirements', p.requirements,
           'time_commitment', p.time_commitment
         ) order by p.sort_order, p.title), '[]'::jsonb)
    from wagesociety.staff_positions p where p.is_open;
$$;

/* ── applying ────────────────────────────────────────────────────────────── */

create or replace function public.ws_apply_staff(p_position_slug text, p_answers jsonb)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
declare v_uid uuid := auth.uid(); v_open boolean; v_existing text; v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select is_open into v_open from wagesociety.staff_positions where slug = p_position_slug;
  if v_open is null then return jsonb_build_object('ok', false, 'reason', 'unknown_position'); end if;
  if not v_open then return jsonb_build_object('ok', false, 'reason', 'closed'); end if;

  select status into v_existing from wagesociety.staff_applications
   where user_id = v_uid and status in ('submitted','reviewing','interview') limit 1;
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_applied', 'status', v_existing);
  end if;

  -- A rejection is meant to mean something for a while, otherwise the queue fills with
  -- the same person every day.
  if exists (
    select 1 from wagesociety.staff_applications
     where user_id = v_uid and status = 'rejected' and decided_at > now() - interval '60 days'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'cooldown');
  end if;

  insert into wagesociety.staff_applications (user_id, position_slug, answers)
  values (v_uid, p_position_slug, coalesce(p_answers, '{}'::jsonb))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.ws_my_staff_application()
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'wagesociety'
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return 'null'::jsonb; end if;
  return coalesce((
    select jsonb_build_object(
             'id', a.id, 'position', a.position_slug, 'title', p.title,
             'status', a.status, 'created_at', a.created_at, 'decided_at', a.decided_at,
             'review_note', case when a.status in ('hired','rejected') then a.review_note end)
      from wagesociety.staff_applications a
      join wagesociety.staff_positions p on p.slug = a.position_slug
     where a.user_id = v_uid order by a.created_at desc limit 1
  ), 'null'::jsonb);
end $$;

/** A staff member's own checklist, so onboarding is not something only a manager sees. */
create or replace function public.ws_my_onboarding()
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'wagesociety'
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'slug', t.slug, 'title', t.title, 'detail', t.detail,
             'required', t.is_required, 'done_at', pr.done_at) order by t.sort_order)
      from wagesociety.staff_onboarding_progress pr
      join wagesociety.staff_onboarding_tasks t on t.slug = pr.task_slug
     where pr.user_id = v_uid and t.is_active
  ), '[]'::jsonb);
end $$;

/* ── the console ─────────────────────────────────────────────────────────── */

create or replace function public.ws_admin_staff_applications(p_status text default null)
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
             'id', a.id, 'user_id', a.user_id, 'email', pr.email, 'username', pr.username,
             'display_name', pr.display_name, 'avatar_url', pr.avatar_url,
             'member_since', pr.created_at,
             'position', a.position_slug, 'title', po.title, 'status', a.status,
             'answers', a.answers, 'review_note', a.review_note,
             'created_at', a.created_at, 'decided_at', a.decided_at,
             'reviewer', (select email from wagesociety.profiles r where r.id = a.reviewer_id),
             'discord_linked', exists (select 1 from wagesociety.discord_links d where d.user_id = a.user_id),
             'current_role', coalesce((select ro.name from wagesociety.user_roles ur
                                         join wagesociety.roles ro on ro.id = ur.role_id
                                        where ur.user_id = a.user_id
                                        order by ro.priority desc limit 1), 'member')
           ) order by
             case a.status when 'submitted' then 0 when 'reviewing' then 1 when 'interview' then 2 else 3 end,
             a.created_at desc)
      from wagesociety.staff_applications a
      join wagesociety.profiles pr on pr.id = a.user_id
      join wagesociety.staff_positions po on po.slug = a.position_slug
     where p_status is null or a.status = p_status
  ), '[]'::jsonb);
end $$;

/**
 * Move an application along. 'hired' is the one that does work: it grants the website
 * role the position carries, hands over its badge, and seeds the checklist. Doing those
 * three by hand is how a moderator ends up with access and no onboarding, or onboarding
 * and no access.
 */
create or replace function public.ws_admin_staff_decide(
  p_id uuid, p_status text, p_note text default null
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
declare
  v_app     wagesociety.staff_applications%rowtype;
  v_pos     wagesociety.staff_positions%rowtype;
  v_role_res jsonb;
  v_seeded  int := 0;
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

  update wagesociety.staff_applications set
    status      = p_status,
    review_note = coalesce(nullif(btrim(coalesce(p_note,'')),''), review_note),
    reviewer_id = auth.uid(),
    decided_at  = case when p_status in ('hired','rejected','withdrawn') then now() else decided_at end
  where id = p_id;

  if p_status = 'hired' then
    -- Reuses ws_admin_set_role, so the same ladder applies: a manager cannot hire
    -- someone into a position that outranks them.
    v_role_res := public.ws_admin_set_role(v_app.user_id, v_pos.website_role,
                                           'hired as ' || v_pos.title);
    if not coalesce((v_role_res->>'ok')::boolean, false) then
      -- Undo the status change rather than leave a hire with no access.
      update wagesociety.staff_applications set status = v_app.status, decided_at = v_app.decided_at
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

/** Everyone who holds a staff role, with how far through onboarding they are. */
create or replace function public.ws_admin_staff_roster()
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
             'user_id', p.id, 'email', p.email, 'username', p.username,
             'display_name', p.display_name, 'avatar_url', p.avatar_url,
             'role', ro.name, 'source', ur.source, 'locked', ur.locked,
             'since', ur.assigned_at,
             'discord_linked', exists (select 1 from wagesociety.discord_links d where d.user_id = p.id),
             'tasks_total', (select count(*) from wagesociety.staff_onboarding_progress g where g.user_id = p.id),
             'tasks_done',  (select count(*) from wagesociety.staff_onboarding_progress g
                              where g.user_id = p.id and g.done_at is not null)
           ) order by ro.priority desc, p.username)
      from wagesociety.user_roles ur
      join wagesociety.roles ro on ro.id = ur.role_id
      join wagesociety.profiles p on p.id = ur.user_id
     where ro.priority >= 2
  ), '[]'::jsonb);
end $$;

create or replace function public.ws_admin_staff_onboarding(p_user_id uuid)
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
             'slug', t.slug, 'title', t.title, 'detail', t.detail,
             'required', t.is_required, 'position', t.position_slug,
             'done_at', pr.done_at, 'note', pr.note,
             'done_by', (select email from wagesociety.profiles d where d.id = pr.done_by))
           order by t.sort_order)
      from wagesociety.staff_onboarding_progress pr
      join wagesociety.staff_onboarding_tasks t on t.slug = pr.task_slug
     where pr.user_id = p_user_id and t.is_active
  ), '[]'::jsonb);
end $$;

create or replace function public.ws_admin_staff_task_set(
  p_user_id uuid, p_task_slug text, p_done boolean, p_note text default null
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
begin
  if not public.ws_is_staff('manager') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into wagesociety.staff_onboarding_progress (user_id, task_slug, done_at, done_by, note)
  values (p_user_id, p_task_slug,
          case when p_done then now() end, case when p_done then auth.uid() end,
          nullif(btrim(coalesce(p_note,'')),''))
  on conflict (user_id, task_slug) do update set
    done_at = case when p_done then coalesce(wagesociety.staff_onboarding_progress.done_at, now()) end,
    done_by = case when p_done then coalesce(wagesociety.staff_onboarding_progress.done_by, auth.uid()) end,
    note    = coalesce(excluded.note, wagesociety.staff_onboarding_progress.note);

  perform public.ws_audit('staff.task', jsonb_build_object(
    'user', p_user_id, 'task', p_task_slug, 'done', p_done));
  return jsonb_build_object('ok', true);
end $$;

/** Start someone's checklist without an application — for staff hired before this existed. */
create or replace function public.ws_admin_staff_start_onboarding(
  p_user_id uuid, p_position_slug text default null
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
declare v_seeded int := 0;
begin
  if not public.ws_is_staff('manager') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into wagesociety.staff_onboarding_progress (user_id, task_slug)
  select p_user_id, t.slug from wagesociety.staff_onboarding_tasks t
   where t.is_active and (t.position_slug is null
                          or (p_position_slug is not null and t.position_slug = p_position_slug))
  on conflict do nothing;
  get diagnostics v_seeded = row_count;
  perform public.ws_audit('staff.onboarding_start', jsonb_build_object(
    'user', p_user_id, 'position', p_position_slug, 'tasks', v_seeded));
  return jsonb_build_object('ok', true, 'tasks_seeded', v_seeded);
end $$;

/* ── editing positions and tasks ─────────────────────────────────────────── */

create or replace function public.ws_admin_list_positions()
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'wagesociety'
as $$
begin
  if not public.ws_is_staff('manager') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'positions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', p.slug, 'title', p.title, 'blurb', p.blurb,
               'responsibilities', p.responsibilities, 'requirements', p.requirements,
               'time_commitment', p.time_commitment, 'website_role', p.website_role,
               'badge_slug', p.badge_slug, 'is_open', p.is_open, 'sort_order', p.sort_order,
               'open_applications', (select count(*) from wagesociety.staff_applications a
                                      where a.position_slug = p.slug
                                        and a.status in ('submitted','reviewing','interview'))
             ) order by p.sort_order, p.title)
        from wagesociety.staff_positions p), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', t.slug, 'title', t.title, 'detail', t.detail,
               'position_slug', t.position_slug, 'is_required', t.is_required,
               'is_active', t.is_active, 'sort_order', t.sort_order
             ) order by t.sort_order, t.title)
        from wagesociety.staff_onboarding_tasks t), '[]'::jsonb));
end $$;

create or replace function public.ws_admin_save_position(
  p_slug text, p_title text, p_blurb text,
  p_responsibilities text[], p_requirements text[], p_time_commitment text,
  p_website_role text, p_badge_slug text, p_is_open boolean, p_sort_order integer
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
declare v_slug text := lower(btrim(coalesce(p_slug,'')));
begin
  if not public.ws_is_staff('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_slug !~ '^[a-z][a-z0-9_]{1,39}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_slug');
  end if;
  if p_website_role not in ('staff','manager','admin') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_role');
  end if;
  if public.ws_role_rank(p_website_role) >= public.ws_role_rank(public.ws_current_role()) then
    return jsonb_build_object('ok', false, 'reason', 'above_your_level');
  end if;

  insert into wagesociety.staff_positions
    (slug, title, blurb, responsibilities, requirements, time_commitment,
     website_role, badge_slug, is_open, sort_order)
  values (v_slug, btrim(p_title), coalesce(p_blurb,''),
          coalesce(p_responsibilities,'{}'), coalesce(p_requirements,'{}'),
          nullif(btrim(coalesce(p_time_commitment,'')),''),
          p_website_role, nullif(btrim(coalesce(p_badge_slug,'')),''),
          coalesce(p_is_open,true), coalesce(p_sort_order,100))
  on conflict (slug) do update set
    title = excluded.title, blurb = excluded.blurb,
    responsibilities = excluded.responsibilities, requirements = excluded.requirements,
    time_commitment = excluded.time_commitment, website_role = excluded.website_role,
    badge_slug = excluded.badge_slug, is_open = excluded.is_open,
    sort_order = excluded.sort_order;

  perform public.ws_audit('staff.position.save', jsonb_build_object('slug', v_slug, 'open', p_is_open));
  return jsonb_build_object('ok', true, 'slug', v_slug);
end $$;

create or replace function public.ws_admin_save_onboarding_task(
  p_slug text, p_title text, p_detail text, p_position_slug text,
  p_is_required boolean, p_is_active boolean, p_sort_order integer
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
declare v_slug text := lower(btrim(coalesce(p_slug,'')));
begin
  if not public.ws_is_staff('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_slug !~ '^[a-z][a-z0-9_]{1,39}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_slug');
  end if;

  insert into wagesociety.staff_onboarding_tasks
    (slug, title, detail, position_slug, is_required, is_active, sort_order)
  values (v_slug, btrim(p_title), coalesce(p_detail,''),
          nullif(btrim(coalesce(p_position_slug,'')),''),
          coalesce(p_is_required,true), coalesce(p_is_active,true), coalesce(p_sort_order,100))
  on conflict (slug) do update set
    title = excluded.title, detail = excluded.detail,
    position_slug = excluded.position_slug, is_required = excluded.is_required,
    is_active = excluded.is_active, sort_order = excluded.sort_order;

  perform public.ws_audit('staff.task.save', jsonb_build_object('slug', v_slug));
  return jsonb_build_object('ok', true, 'slug', v_slug);
end $$;

/* ── grants ──────────────────────────────────────────────────────────────── */

revoke all on function public.ws_apply_staff(text, jsonb)                       from public, anon;
revoke all on function public.ws_my_staff_application()                         from public, anon;
revoke all on function public.ws_my_onboarding()                                from public, anon;
revoke all on function public.ws_admin_staff_applications(text)                 from public, anon;
revoke all on function public.ws_admin_staff_decide(uuid, text, text)           from public, anon;
revoke all on function public.ws_admin_staff_roster()                           from public, anon;
revoke all on function public.ws_admin_staff_onboarding(uuid)                   from public, anon;
revoke all on function public.ws_admin_staff_task_set(uuid, text, boolean, text) from public, anon;
revoke all on function public.ws_admin_staff_start_onboarding(uuid, text)       from public, anon;
revoke all on function public.ws_admin_list_positions()                         from public, anon;
revoke all on function public.ws_admin_save_position(text, text, text, text[], text[], text, text, text, boolean, integer) from public, anon;
revoke all on function public.ws_admin_save_onboarding_task(text, text, text, text, boolean, boolean, integer) from public, anon;

-- The openings list is the one thing here a signed-out visitor is meant to read.
grant execute on function public.ws_staff_openings()                            to anon, authenticated;
grant execute on function public.ws_apply_staff(text, jsonb)                    to authenticated;
grant execute on function public.ws_my_staff_application()                      to authenticated;
grant execute on function public.ws_my_onboarding()                             to authenticated;
grant execute on function public.ws_admin_staff_applications(text)              to authenticated;
grant execute on function public.ws_admin_staff_decide(uuid, text, text)        to authenticated;
grant execute on function public.ws_admin_staff_roster()                        to authenticated;
grant execute on function public.ws_admin_staff_onboarding(uuid)                to authenticated;
grant execute on function public.ws_admin_staff_task_set(uuid, text, boolean, text) to authenticated;
grant execute on function public.ws_admin_staff_start_onboarding(uuid, text)    to authenticated;
grant execute on function public.ws_admin_list_positions()                      to authenticated;
grant execute on function public.ws_admin_save_position(text, text, text, text[], text[], text, text, text, boolean, integer) to authenticated;
grant execute on function public.ws_admin_save_onboarding_task(text, text, text, text, boolean, boolean, integer) to authenticated;
