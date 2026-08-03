-- Three separate things that had started to blur into each other.
--
--   WEBSITE ROLE   wagesociety.user_roles     what you may DO      (permission matrix)
--   TIER           profiles.tier              what you GET         (paid entitlements)
--   BADGE          wagesociety.user_badges    who you ARE          (honours, and the
--                                                                   entitlements attached
--                                                                   to being early or a
--                                                                   founder)
--
-- Each has its own set of Discord roles, and the sets must not overlap. The reason is
-- not tidiness: the tier sync in ws_svc_discord_sync actively REMOVES every tier role a
-- member does not currently qualify for. Point a badge or a staff mapping at a tier role
-- and the next tier sync strips it back off, silently, on a schedule. The trigger below
-- makes that impossible to configure rather than something to remember.
--
--   staff roles  → Director, Admin, Staff, Moderator, Helper   (discord_role_map)
--   tier roles   → member, Creator, Pro, Elite, Unlimited      (discord_tier_role_map)
--   badge roles  → Founder, Staff, OG                          (badges.discord_role_id)
--
-- Staff appears in two of those on purpose: holding the Discord Staff role both grants
-- website access and earns the staff badge. Those are additive and never remove, so they
-- converge instead of fighting. A tier role in either list would not.

/* ── settings ────────────────────────────────────────────────────────────── */

create table if not exists wagesociety.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Launch day. Null means "not announced yet", and every OG grace period stays open
-- until it is set — nobody starts paying because a date was forgotten.
insert into wagesociety.app_settings (key, value)
values ('launch_at', 'null'::jsonb)
on conflict (key) do nothing;

alter table wagesociety.app_settings enable row level security;

/* ── what a badge is worth ───────────────────────────────────────────────── */

alter table wagesociety.badges
  add column if not exists discord_role_id text,
  -- A tier this badge guarantees, free, for as long as the badge is held.
  add column if not exists floor_tier      text,
  -- A permanent discount worth this tier's price, applied to any paid plan.
  add column if not exists discount_tier   text;

alter table wagesociety.user_memberships
  add column if not exists never_expires boolean not null default false;

comment on column wagesociety.badges.floor_tier is
  'Tier this badge guarantees free and forever. OG => creator, founder => unlimited.';
comment on column wagesociety.badges.discount_tier is
  'Every paid plan costs its price minus this tier''s price. OG => creator.';
comment on column wagesociety.user_memberships.never_expires is
  'Granted by a badge, not by Stripe. No subscription backs it and nothing may lapse it.';

update wagesociety.badges set
  discord_role_id = '1230663648377311262',   -- Founder
  floor_tier      = 'unlimited'
where slug = 'founder';

update wagesociety.badges set
  discord_role_id = '1162313669502320680'    -- Staff
where slug = 'staff';

update wagesociety.badges set
  discord_role_id = '1533916669569663066',   -- OG, created 2026-08-03 to mirror the badge
  floor_tier      = 'creator',
  discount_tier   = 'creator'
where slug = 'og';

/* ── the guard ───────────────────────────────────────────────────────────── */

create or replace function wagesociety.assert_not_a_tier_role()
returns trigger
language plpgsql
set search_path to 'wagesociety', 'public'
as $$
declare v_role text; v_name text;
begin
  -- Read through to_jsonb rather than NEW.<column>: this one function guards two tables
  -- whose columns are named differently, and PL/pgSQL resolves record fields at compile
  -- time, so even an unreachable CASE branch naming a column the table lacks fails.
  v_role := coalesce(to_jsonb(new) ->> 'discord_role_id', to_jsonb(new) ->> 'role_id');
  if v_role is null then return new; end if;

  select role_name into v_name
    from wagesociety.discord_tier_role_map where role_id = v_role;

  if found then
    raise exception
      'Discord role % (%) is a subscription tier role. The tier sync removes tier roles a member does not qualify for, so using it here would strip it on the next run.',
      v_name, v_role
      using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists badges_not_a_tier_role on wagesociety.badges;
create trigger badges_not_a_tier_role
  before insert or update of discord_role_id on wagesociety.badges
  for each row execute function wagesociety.assert_not_a_tier_role();

drop trigger if exists role_map_not_a_tier_role on wagesociety.discord_role_map;
create trigger role_map_not_a_tier_role
  before insert or update of role_id on wagesociety.discord_role_map
  for each row execute function wagesociety.assert_not_a_tier_role();

/* ── the staff mapping ───────────────────────────────────────────────────── */

-- Mirrors the Discord hierarchy onto the website ladder. Note the bot sits at position
-- 14, below Director (18) and Admin (17), so it can read those roles but can never
-- assign them. That is fine — this direction only reads — but it does mean the website
-- can never hand someone Director.
insert into wagesociety.discord_role_map (guild_id, role_id, role_name, website_role, badge_slug)
values
  ('1160158300168527895', '1171230293210959872', 'Director',  'admin',   'staff'),
  ('1160158300168527895', '1160653381543661609', 'Admin',     'admin',   'staff'),
  ('1160158300168527895', '1162313669502320680', 'Staff',     'manager', 'staff'),
  ('1160158300168527895', '1171231031857258587', 'Moderator', 'staff',   'staff'),
  ('1160158300168527895', '1509868681369227345', 'Helper',    'staff',   'staff')
on conflict (guild_id, role_id) do update set
  role_name    = excluded.role_name,
  website_role = excluded.website_role,
  badge_slug   = excluded.badge_slug,
  updated_at   = now();

-- Founder was mapped by hand in the console before this ran, as a staff role carrying the
-- founder badge. Kept, because it is a deliberate decision and it is not wrong: the
-- founders do run the place. Only the missing role_name is filled in, so the console can
-- label it.
--
-- Worth knowing what it now implies, though: the founder badge carries floor_tier
-- 'unlimited', so handing someone the Founder role in Discord grants them Unlimited for
-- life on the website. That is the intent for the three founders; it is not something to
-- give away casually.
update wagesociety.discord_role_map
   set role_name = 'Founder'
 where role_id = '1230663648377311262' and role_name is null;

/* ── entitlements ────────────────────────────────────────────────────────── */

/** Launch day, readable by anyone — the public plans page prices against it. */
create or replace function public.ws_launch_info()
returns jsonb
language sql stable security definer
set search_path to 'public', 'wagesociety'
as $$
  select jsonb_build_object(
    'launch_at', (select value from wagesociety.app_settings where key = 'launch_at'),
    'launched', coalesce(
      (select (value #>> '{}')::timestamptz <= now()
         from wagesociety.app_settings where key = 'launch_at'), false));
$$;

create or replace function public.ws_admin_set_launch_date(p_launch_at timestamptz)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
begin
  if not public.ws_is_staff('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into wagesociety.app_settings (key, value, updated_at)
  values ('launch_at', case when p_launch_at is null then 'null'::jsonb
                            else to_jsonb(p_launch_at) end, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();

  perform public.ws_audit('settings.launch_at', jsonb_build_object('launch_at', p_launch_at));
  return jsonb_build_object('ok', true, 'launch_at', p_launch_at);
end $$;

/**
 * What one person pays for one plan, after their badges.
 *
 * The single source of pricing truth. checkout.js calls the service wrapper so a
 * discount can never be argued for from the browser, and the plans page calls the
 * caller-scoped one so the price on screen is the price charged.
 *
 * Order matters: a founder is free before anything else is considered, and the launch
 * grace beats the standing discount while it lasts.
 */
create or replace function public.ws_svc_price_for(
  p_user_id uuid, p_plan_slug text, p_cycle text default 'monthly'
) returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'wagesociety'
as $$
declare
  v_annual   boolean := p_cycle = 'annual';
  v_base     bigint;
  v_discount bigint := 0;
  v_launch   timestamptz;
  v_founder  boolean;
  v_disc_tier text;
  v_reason   text := 'standard';
begin
  select case when v_annual then coalesce(annual_price_cents, price_cents * 10) else price_cents end
    into v_base
    from wagesociety.membership_plans where slug = p_plan_slug and is_active;
  if v_base is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_plan');
  end if;
  if v_base = 0 then
    return jsonb_build_object('ok', true, 'base_cents', 0, 'discount_cents', 0,
                              'amount_cents', 0, 'free', true, 'reason', 'free_plan');
  end if;

  select (value #>> '{}')::timestamptz into v_launch
    from wagesociety.app_settings where key = 'launch_at';

  -- A founder holds unlimited outright; nothing they pick is ever billed.
  select exists (
    select 1 from wagesociety.user_badges ub
      join wagesociety.badges b on b.slug = ub.badge_slug
     where ub.user_id = p_user_id and b.is_active and b.floor_tier = 'unlimited'
  ) into v_founder;

  if v_founder then
    return jsonb_build_object('ok', true, 'base_cents', v_base, 'discount_cents', v_base,
                              'amount_cents', 0, 'free', true, 'reason', 'founder');
  end if;

  -- The highest-value standing discount the member's badges carry.
  select b.discount_tier into v_disc_tier
    from wagesociety.user_badges ub
    join wagesociety.badges b on b.slug = ub.badge_slug
   where ub.user_id = p_user_id and b.is_active and b.discount_tier is not null
   order by (select mp.price_cents from wagesociety.membership_plans mp
              where mp.slug = b.discount_tier) desc nulls last
   limit 1;

  if v_disc_tier is not null then
    -- Before launch an early member pays nothing at all, on any tier.
    if v_launch is null or now() < v_launch then
      return jsonb_build_object('ok', true, 'base_cents', v_base, 'discount_cents', v_base,
                                'amount_cents', 0, 'free', true, 'reason', 'launch_grace',
                                'launch_at', v_launch);
    end if;
    select case when v_annual then coalesce(annual_price_cents, price_cents * 10) else price_cents end
      into v_discount
      from wagesociety.membership_plans where slug = v_disc_tier;
    v_discount := least(coalesce(v_discount, 0), v_base);
    v_reason := case when v_base - v_discount = 0 then 'included' else 'early_member' end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'base_cents', v_base,
    'discount_cents', v_discount,
    'amount_cents', v_base - v_discount,
    'free', (v_base - v_discount) = 0,
    'reason', v_reason,
    'launch_at', v_launch);
end $$;

/** The same, for the signed-in caller, so the page can price itself honestly. */
create or replace function public.ws_price_for(p_plan_slug text, p_cycle text default 'monthly')
returns jsonb
language sql stable security definer
set search_path to 'public', 'wagesociety'
as $$
  select public.ws_svc_price_for(auth.uid(), p_plan_slug, p_cycle);
$$;

/** Every plan priced for the caller in one round trip. */
create or replace function public.ws_my_pricing(p_cycle text default 'monthly')
returns jsonb
language sql stable security definer
set search_path to 'public', 'wagesociety'
as $$
  select coalesce(jsonb_object_agg(mp.slug, public.ws_svc_price_for(auth.uid(), mp.slug, p_cycle)), '{}'::jsonb)
    from wagesociety.membership_plans mp where mp.is_active;
$$;

/**
 * Give someone everything their badges entitle them to.
 *
 * Idempotent, and safe to run on every grant, every sync, and by hand. It only ever
 * raises a tier — an OG who has paid for Elite is not dropped to Creator because Creator
 * is their floor.
 */
create or replace function public.ws_svc_apply_badge_entitlements(p_user_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
declare
  v_floor text; v_current text; v_email text; v_changed boolean := false;
begin
  select tier, email into v_current, v_email from wagesociety.profiles where id = p_user_id;
  if v_current is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_user');
  end if;

  -- The most generous floor any of their badges carries.
  select b.floor_tier into v_floor
    from wagesociety.user_badges ub
    join wagesociety.badges b on b.slug = ub.badge_slug
   where ub.user_id = p_user_id and b.is_active and b.floor_tier is not null
   order by (select mp.sort_order from wagesociety.membership_plans mp
              where mp.slug = b.floor_tier) desc nulls last
   limit 1;

  if v_floor is null then
    return jsonb_build_object('ok', true, 'floor', null, 'changed', false);
  end if;

  if (select sort_order from wagesociety.membership_plans where slug = v_floor)
     > coalesce((select sort_order from wagesociety.membership_plans where slug = v_current), -1)
  then
    update wagesociety.profiles set tier = v_floor where id = p_user_id;
    v_changed := true;
  end if;

  -- A membership row that no Stripe subscription backs, so nothing can lapse it. The
  -- far-future period end is belt and braces: nothing polls for expiry today, and this
  -- keeps it correct if something ever does.
  --
  -- Skipped when there is no email, because the table's unique key is (email, plan_slug)
  -- and Postgres treats NULLs as distinct — the upsert would insert a fresh duplicate on
  -- every run. Discord does not always give us an email, and at least one member here has
  -- none. The tier above is what actually grants access, so they lose nothing.
  if v_email is not null then
    insert into wagesociety.user_memberships
      (user_id, email, plan_slug, status, billing_cycle, source, current_period_end, never_expires)
    values (p_user_id, v_email, v_floor, 'active', 'monthly', 'badge',
            now() + interval '100 years', true)
    on conflict (email, plan_slug) do update set
      status = 'active', source = 'badge', never_expires = true,
      current_period_end = now() + interval '100 years', updated_at = now();
  end if;

  perform public.ws_audit('badge.entitlement', jsonb_build_object(
    'user', p_user_id, 'email', v_email, 'floor_tier', v_floor, 'tier_raised', v_changed));
  return jsonb_build_object('ok', true, 'floor', v_floor, 'changed', v_changed);
end $$;

/* ── grants ──────────────────────────────────────────────────────────────── */

revoke all on function public.ws_launch_info()                                    from public;
revoke all on function public.ws_admin_set_launch_date(timestamptz)               from public, anon;
revoke all on function public.ws_svc_price_for(uuid, text, text)                  from public, anon, authenticated;
revoke all on function public.ws_price_for(text, text)                            from public, anon;
revoke all on function public.ws_my_pricing(text)                                 from public, anon;
revoke all on function public.ws_svc_apply_badge_entitlements(uuid)               from public, anon, authenticated;

grant execute on function public.ws_launch_info()                                 to anon, authenticated;
grant execute on function public.ws_admin_set_launch_date(timestamptz)            to authenticated;
grant execute on function public.ws_svc_price_for(uuid, text, text)               to service_role;
grant execute on function public.ws_price_for(text, text)                         to authenticated;
grant execute on function public.ws_my_pricing(text)                              to authenticated;
grant execute on function public.ws_svc_apply_badge_entitlements(uuid)            to service_role;
