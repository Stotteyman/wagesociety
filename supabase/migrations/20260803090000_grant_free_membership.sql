-- Activate a membership that costs nothing, without going near Stripe.
--
-- A $0 Stripe subscription still wants a payment method, can still fail, and leaves a
-- customer record implying a billing relationship nobody has. A founder, or an early
-- member before launch, should simply have the tier.
--
-- Service-role only, and it re-prices the plan itself rather than trusting its caller.
-- checkout.js has already asked ws_svc_price_for, but a function that hands out a paid
-- tier for free must not depend on the caller having asked the right question first —
-- otherwise it is an endpoint that grants Unlimited to anyone who reaches it.
create or replace function public.ws_svc_grant_free_membership(
  p_user_id uuid, p_plan_slug text, p_cycle text default 'monthly', p_reason text default null
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'wagesociety'
as $$
declare v_quote jsonb; v_email text; v_never boolean;
begin
  v_quote := public.ws_svc_price_for(p_user_id, p_plan_slug, p_cycle);
  if not coalesce((v_quote->>'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', v_quote->>'reason');
  end if;
  if (v_quote->>'amount_cents')::bigint <> 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_free',
                              'amount_cents', v_quote->>'amount_cents');
  end if;

  select email into v_email from wagesociety.profiles where id = p_user_id;

  -- A founder's grant is permanent. A launch-grace grant is not: it runs to launch day,
  -- after which they re-subscribe at the early-member price. Recording that difference
  -- here is what stops the grace period quietly becoming a lifetime giveaway.
  v_never := (v_quote->>'reason') = 'founder';

  update wagesociety.profiles
     set tier = p_plan_slug
   where id = p_user_id
     and (select sort_order from wagesociety.membership_plans where slug = p_plan_slug)
       > coalesce((select sort_order from wagesociety.membership_plans mp
                    where mp.slug = wagesociety.profiles.tier), -1);

  if v_email is not null then
    insert into wagesociety.user_memberships
      (user_id, email, plan_slug, status, billing_cycle, source, current_period_end, never_expires)
    values (p_user_id, v_email, p_plan_slug, 'active',
            case when p_cycle = 'annual' then 'annual' else 'monthly' end,
            'entitlement',
            case when v_never then now() + interval '100 years'
                 else coalesce((select (value #>> '{}')::timestamptz
                                  from wagesociety.app_settings where key = 'launch_at'),
                               now() + interval '100 years') end,
            v_never)
    on conflict (email, plan_slug) do update set
      status = 'active', source = 'entitlement',
      never_expires = excluded.never_expires,
      current_period_end = excluded.current_period_end,
      updated_at = now();
  end if;

  perform public.ws_audit('membership.free_grant', jsonb_build_object(
    'user', p_user_id, 'email', v_email, 'plan', p_plan_slug,
    'cycle', p_cycle, 'reason', coalesce(p_reason, v_quote->>'reason')));

  return jsonb_build_object('ok', true, 'plan', p_plan_slug,
                            'reason', v_quote->>'reason', 'never_expires', v_never);
end $$;

revoke all on function public.ws_svc_grant_free_membership(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.ws_svc_grant_free_membership(uuid, text, text, text)
  to service_role;
