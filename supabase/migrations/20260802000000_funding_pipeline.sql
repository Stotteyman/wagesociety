-- Funding pipeline for W.A.G.E. Society.
--
-- Same shape as the Orange Duck table, in this business's own schema. The
-- difference is the access route: nothing here is reachable with the anon key.
-- RLS is on with no policies, and the admin console reaches the rows through
-- the SECURITY DEFINER ws_admin_funding_* functions below, which check the
-- caller's role the same way every other admin RPC does.
--
-- The Studio Console desktop app writes the same rows, so the pipeline is one
-- list wherever it is opened.

create table if not exists wagesociety.funding_opportunities (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  kind          text not null default 'grant'
                  check (kind in ('grant','sponsor','investor','brand_deal','loan','accelerator','other')),
  stage         text not null default 'researching'
                  check (stage in ('researching','applying','submitted','won','lost','passed')),
  amount_cents  bigint check (amount_cents is null or amount_cents >= 0),
  deadline      date,
  url           text,
  notes         text,
  eligibility   text,
  -- 'import' marks rows carried over from the console's old local file.
  source        text not null default 'manual'
                  constraint funding_opportunities_source_check check (source in ('manual','import')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz
);

create unique index if not exists funding_opportunities_name_key
  on wagesociety.funding_opportunities (lower(btrim(name)));

create index if not exists funding_opportunities_stage_idx
  on wagesociety.funding_opportunities (stage, deadline);

create table if not exists wagesociety.funding_financials (
  id                     integer primary key default 1 check (id = 1),
  monthly_expenses_cents bigint not null default 0,
  cash_on_hand_cents     bigint not null default 0,
  notes                  text,
  updated_at             timestamptz not null default now()
);

insert into wagesociety.funding_financials (id) values (1)
  on conflict (id) do nothing;

create or replace function wagesociety.funding_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists funding_opportunities_touch on wagesociety.funding_opportunities;
create trigger funding_opportunities_touch
  before update on wagesociety.funding_opportunities
  for each row execute function wagesociety.funding_touch_updated_at();

drop trigger if exists funding_financials_touch on wagesociety.funding_financials;
create trigger funding_financials_touch
  before update on wagesociety.funding_financials
  for each row execute function wagesociety.funding_touch_updated_at();

alter table wagesociety.funding_opportunities enable row level security;
alter table wagesociety.funding_financials    enable row level security;

-- ── admin RPCs ────────────────────────────────────────────────────────────
-- 'admin', not 'manager': these rows carry the cash position and runway, which
-- is a narrower audience than the FAQ editor.

create or replace function public.ws_admin_funding_list()
returns setof wagesociety.funding_opportunities
language plpgsql stable security definer
set search_path to 'wagesociety', 'public'
as $$
begin
  if not public.ws_is_staff('admin') then raise exception 'forbidden' using errcode='42501'; end if;
  return query
    select * from wagesociety.funding_opportunities
    where archived_at is null
    order by
      case stage when 'researching' then 0 when 'applying' then 1 when 'submitted' then 2
                 when 'won' then 3 when 'lost' then 4 else 5 end,
      deadline asc nulls last,
      name asc;
end $$;

create or replace function public.ws_admin_funding_save(
  p_id uuid,
  p_name text,
  p_kind text,
  p_stage text,
  p_amount_cents bigint,
  p_deadline date,
  p_url text,
  p_notes text
) returns jsonb
language plpgsql security definer
set search_path to 'wagesociety', 'public'
as $$
declare rid uuid;
begin
  if not public.ws_is_staff('admin') then raise exception 'forbidden' using errcode='42501'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'name is required'; end if;

  if p_id is null then
    insert into wagesociety.funding_opportunities
      (name, kind, stage, amount_cents, deadline, url, notes, source)
    values
      (btrim(p_name), coalesce(p_kind,'grant'), coalesce(p_stage,'researching'),
       p_amount_cents, p_deadline, nullif(btrim(coalesce(p_url,'')),''),
       nullif(btrim(coalesce(p_notes,'')),''), 'manual')
    returning id into rid;
  else
    update wagesociety.funding_opportunities set
      name         = btrim(p_name),
      kind         = coalesce(p_kind, kind),
      stage        = coalesce(p_stage, stage),
      amount_cents = p_amount_cents,
      deadline     = p_deadline,
      url          = nullif(btrim(coalesce(p_url,'')),''),
      notes        = nullif(btrim(coalesce(p_notes,'')),'')
    where id = p_id
    returning id into rid;

    if rid is null then raise exception 'no such opportunity'; end if;
  end if;

  perform public.ws_audit('funding.save', jsonb_build_object('id', rid, 'name', btrim(p_name)));
  return (select to_jsonb(f) from wagesociety.funding_opportunities f where f.id = rid);
end $$;

create or replace function public.ws_admin_funding_delete(p_id uuid)
returns boolean
language plpgsql security definer
set search_path to 'wagesociety', 'public'
as $$
declare t text;
begin
  if not public.ws_is_staff('admin') then raise exception 'forbidden' using errcode='42501'; end if;
  select name into t from wagesociety.funding_opportunities where id = p_id;
  delete from wagesociety.funding_opportunities where id = p_id;
  perform public.ws_audit('funding.delete', jsonb_build_object('id', p_id, 'name', t));
  return true;
end $$;

-- The cash position behind the runway figure, in its own call.
create or replace function public.ws_admin_funding_overview()
returns jsonb
language plpgsql stable security definer
set search_path to 'wagesociety', 'public'
as $$
declare fin jsonb;
begin
  if not public.ws_is_staff('admin') then raise exception 'forbidden' using errcode='42501'; end if;

  select to_jsonb(f) into fin from wagesociety.funding_financials f where f.id = 1;

  return jsonb_build_object(
    'financials',   coalesce(fin, '{}'::jsonb),
    'generated_at', now()
  );
end $$;

create or replace function public.ws_admin_funding_save_financials(
  p_monthly_expenses_cents bigint,
  p_cash_on_hand_cents bigint,
  p_notes text
) returns jsonb
language plpgsql security definer
set search_path to 'wagesociety', 'public'
as $$
begin
  if not public.ws_is_staff('admin') then raise exception 'forbidden' using errcode='42501'; end if;

  update wagesociety.funding_financials set
    monthly_expenses_cents = greatest(coalesce(p_monthly_expenses_cents, 0), 0),
    cash_on_hand_cents     = greatest(coalesce(p_cash_on_hand_cents, 0), 0),
    notes                  = nullif(btrim(coalesce(p_notes,'')),'')
  where id = 1;

  perform public.ws_audit('funding.financials', jsonb_build_object(
    'monthly_expenses_cents', p_monthly_expenses_cents,
    'cash_on_hand_cents', p_cash_on_hand_cents));

  return (select to_jsonb(f) from wagesociety.funding_financials f where f.id = 1);
end $$;

revoke all on function public.ws_admin_funding_list()                              from public;
revoke all on function public.ws_admin_funding_save(uuid,text,text,text,bigint,date,text,text) from public;
revoke all on function public.ws_admin_funding_delete(uuid)                        from public;
revoke all on function public.ws_admin_funding_overview()                          from public;
revoke all on function public.ws_admin_funding_save_financials(bigint,bigint,text) from public;

grant execute on function public.ws_admin_funding_list()                              to authenticated;
grant execute on function public.ws_admin_funding_save(uuid,text,text,text,bigint,date,text,text) to authenticated;
grant execute on function public.ws_admin_funding_delete(uuid)                        to authenticated;
grant execute on function public.ws_admin_funding_overview()                          to authenticated;
grant execute on function public.ws_admin_funding_save_financials(bigint,bigint,text) to authenticated;
