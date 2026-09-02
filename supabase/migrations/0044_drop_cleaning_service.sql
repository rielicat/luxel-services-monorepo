drop table if exists public.payment_events cascade;
drop table if exists public.bookings cascade;
drop table if exists public.subscriptions cascade;
drop table if exists public.addresses cascade;
drop table if exists public.operators cascade;
drop table if exists public.operation_points cascade;
drop table if exists public.service_types cascade;
drop table if exists public.pricing_config cascade;

drop policy if exists "property_addons_owner_read" on public.property_addons;
drop index if exists public.property_addons_property_idx;
drop table if exists public.property_addons cascade;

alter table public.leads
  drop column if exists service_slug,
  drop column if exists square_meters,
  drop column if exists quote_amount_clp,
  drop column if exists address_line,
  drop column if exists lat,
  drop column if exists lng;
update public.leads set source = 'contact' where source in ('out_of_area', 'quote');
alter table public.leads drop constraint if exists leads_source_check;
alter table public.leads
  add constraint leads_source_check check (source in ('chat_handoff', 'newsletter', 'contact'));

alter table public.properties
  drop column if exists size_m2,
  drop column if exists cleaning_managed_by,
  drop column if exists cleaning_auto_confirm,
  drop column if exists base_nightly_clp;

alter table public.cleanings drop column if exists price_clp;

create or replace function public.admin_sessions(p_days int default 30, p_limit int default 100)
returns table(
  session_id text,
  anon_id text,
  distinct_id text,
  events bigint,
  started_at timestamptz,
  last_at timestamptz,
  first_path text,
  last_path text,
  converted boolean
) language sql stable as $$
  select
    e.session_id,
    (array_agg(e.anon_id order by e.created_at) filter (where e.anon_id is not null))[1],
    (array_agg(e.distinct_id order by e.created_at) filter (where e.distinct_id is not null))[1],
    count(*)::bigint,
    min(e.created_at),
    max(e.created_at),
    (array_agg(e.path order by e.created_at) filter (where e.path is not null))[1],
    (array_agg(e.path order by e.created_at desc) filter (where e.path is not null))[1],
    bool_or(e.event = 'account_viewed')
  from public.analytics_events e
  where e.created_at >= now() - make_interval(days => p_days)
    and e.session_id is not null
  group by e.session_id
  order by max(e.created_at) desc
  limit p_limit;
$$;
