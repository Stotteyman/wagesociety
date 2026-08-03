-- Two findings from Supabase's own security linter, after today's changes.
--
-- 1. `anon` can execute every ws_admin_* function.
--
--    Not an open door — each one gates on ws_is_staff / ws_has_permission, and
--    ws_current_role() returns 'guest' when auth.uid() is null, so an anonymous call
--    raises `forbidden` before touching a row. But the anon key ships inside the browser
--    bundle, so this leaves the entire admin surface reachable by anyone who reads it,
--    with only the gate between them and the data. One function written without a gate,
--    or one gate weakened, and it becomes a real hole with no second line behind it.
--
--    `revoke ... from public` does not fix this: Supabase grants EXECUTE to `anon`
--    explicitly, and revoking the PUBLIC pseudo-role leaves the explicit grant in place.
--    It has to name `anon`. Today's staff and role migrations did; the badge one did not,
--    which is what makes this worth doing properly rather than per-function.
--
--    Done as a loop over pg_proc so it covers the functions that predate today and any
--    signature change cannot silently miss one.
--
-- 2. ws_role_rank had a mutable search_path. It only runs a CASE over a text argument so
--    nothing can be hijacked through it, but every other function here pins its path and
--    an exception invites the next one to skip it too.

create or replace function public.ws_role_rank(p_role text)
returns integer
language sql immutable
set search_path to 'pg_catalog'
as $$
  select case p_role
           when 'superadmin' then 5 when 'admin' then 4 when 'manager' then 3
           when 'staff' then 2 when 'member' then 1 else 0 end;
$$;

revoke all on function public.ws_role_rank(text) from public, anon;
grant execute on function public.ws_role_rank(text) to authenticated;

do $$
declare r record; n int := 0;
begin
  for r in
    select p.oid::regprocedure::text as sig
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       -- Every privileged surface. ws_svc_* is service-role only and already correct;
       -- ws_my_*, ws_staff_openings and the member-facing ws_* are deliberately reachable
       -- by a signed-in user or, for openings, by a visitor, so they are left alone.
       and p.proname like 'ws\_admin\_%'
  loop
    execute format('revoke all on function %s from anon, public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
    n := n + 1;
  end loop;
  raise notice 'locked % ws_admin_* functions to authenticated', n;
end $$;
