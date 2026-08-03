-- Referral links people can read.
--
-- The link was https://wagesociety.com/?ref=WAGE-6SSSQB. It works, but it says nothing
-- about who is inviting you, it cannot be read down a phone, and the person who lands on
-- it sees the ordinary home page with no idea they were invited or what they get.
--
-- Three changes:
--
--  1. A handle resolves as well as a code, so the link becomes /join/stotteyman. Old
--     ?ref=WAGE-XXXX links keep working — they are already out there.
--  2. ws_referrer_info tells the landing page who invited you and what both sides get,
--     without exposing anything private about the referrer.
--  3. The point values move into app_settings. They were hardcoded in the RPC and again
--     in the dashboard copy, so the promise on screen and the points actually awarded
--     were two separate facts that could disagree.

insert into wagesociety.app_settings (key, value) values
  ('referral_reward_referrer', '150'::jsonb),
  ('referral_reward_joiner',   '200'::jsonb)
on conflict (key) do nothing;

/**
 * Who is inviting, and what it is worth. Deliberately readable signed out — it is the
 * whole point of the landing page, and it is reached by anyone holding the link.
 *
 * Returns only what already appears on a public profile. No email, no id, and a miss
 * returns null rather than an error so a mistyped link degrades to the normal home page
 * instead of an error screen.
 */
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
               'color', b.color, 'shape', b.shape) order by b.sort_order)
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

/**
 * Apply a referral. Accepts a handle or the old WAGE-XXXX code.
 *
 * Unchanged in what it awards, but it now says who the referrer was and how many points
 * each side got, so the welcome screen can thank the right person by name instead of the
 * caller guessing.
 */
create or replace function public.ws_apply_referral(p_code text)
returns jsonb
language plpgsql security definer
set search_path to 'wagesociety', 'public'
as $$
declare
  uid uuid := auth.uid();
  refid uuid; already uuid; v_ref text := btrim(coalesce(p_code, ''));
  v_name text; v_handle text;
  v_to_referrer int; v_to_joiner int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_ref = '' then return jsonb_build_object('ok', false, 'reason', 'invalid_code'); end if;

  select referred_by into already from wagesociety.profiles where id = uid;
  if already is not null then return jsonb_build_object('ok', false, 'reason', 'already_referred'); end if;

  -- Handle first, then the legacy code. A handle cannot look like a code (codes start
  -- WAGE-, and the hyphen is not legal in a handle), so there is nothing to disambiguate.
  select id, coalesce(display_name, username), username
    into refid, v_name, v_handle
    from wagesociety.profiles
   where (lower(username) = lower(v_ref) or upper(referral_code) = upper(v_ref))
     and id <> uid and is_suspended = false
   limit 1;
  if refid is null then return jsonb_build_object('ok', false, 'reason', 'invalid_code'); end if;

  select coalesce((select (value #>> '{}')::int from wagesociety.app_settings where key = 'referral_reward_referrer'), 150),
         coalesce((select (value #>> '{}')::int from wagesociety.app_settings where key = 'referral_reward_joiner'), 200)
    into v_to_referrer, v_to_joiner;

  update wagesociety.profiles set referred_by = refid where id = uid;
  insert into wagesociety.referrals (referrer_id, referred_user_id, status, reward_given)
  values (refid, uid, 'verified', true)
  on conflict (referred_user_id) do nothing;

  update wagesociety.profiles
     set referral_points = referral_points + v_to_referrer,
         total_referrals = total_referrals + 1
   where id = refid;
  insert into wagesociety.point_transactions (user_id, amount, type, description)
  values (refid, v_to_referrer, 'referral', 'Referred a new member');

  update wagesociety.profiles set referral_points = referral_points + v_to_joiner where id = uid;
  insert into wagesociety.point_transactions (user_id, amount, type, description)
  values (uid, v_to_joiner, 'referral_joined', 'Joined via referral link');

  update wagesociety.profiles set referral_tier = case
    when total_referrals >= 250 then 'diamond' when total_referrals >= 50 then 'gold'
    when total_referrals >= 10 then 'silver' else 'bronze' end
   where id = refid;

  return jsonb_build_object('ok', true, 'referrer', v_name, 'referrer_handle', v_handle,
                            'points', v_to_joiner, 'referrer_points', v_to_referrer);
end $$;

revoke all on function public.ws_referrer_info(text)  from public;
revoke all on function public.ws_apply_referral(text) from public, anon;
grant execute on function public.ws_referrer_info(text)  to anon, authenticated;
grant execute on function public.ws_apply_referral(text) to authenticated;

-- ws_my_referrals and ws_my_profile both gain the handle and the reward figures, so the
-- pages that show a referral link build it from the handle and quote the same numbers
-- ws_apply_referral awards. Everything they returned before is unchanged.
create or replace function public.ws_my_referrals()
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'wagesociety'
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return 'null'::jsonb; end if;
  return (
    select jsonb_build_object(
      'code', p.referral_code,
      'handle', p.username,
      'points', p.referral_points,
      'total', p.total_referrals,
      'tier', p.referral_tier,
      'reward_referrer', coalesce((select (value #>> '{}')::int from wagesociety.app_settings
                                    where key = 'referral_reward_referrer'), 150),
      'reward_joiner', coalesce((select (value #>> '{}')::int from wagesociety.app_settings
                                   where key = 'referral_reward_joiner'), 200),
      'referrals', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'name', rp.display_name, 'username', rp.username,
                 'status', r.status, 'at', r.created_at) order by r.created_at desc)
          from wagesociety.referrals r
          join wagesociety.profiles rp on rp.id = r.referred_user_id
         where r.referrer_id = uid), '[]'::jsonb),
      'transactions', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'amount', t.amount, 'type', t.type,
                 'description', t.description, 'at', t.created_at) order by t.created_at desc)
          from wagesociety.point_transactions t
         where t.user_id = uid), '[]'::jsonb)
    )
    from wagesociety.profiles p where p.id = uid
  );
end $$;

revoke all on function public.ws_my_referrals() from public, anon;
grant execute on function public.ws_my_referrals() to authenticated;
