create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  distinct_id text,
  anon_id text,
  session_id text,
  customer_id uuid references public.customers(id) on delete set null,
  path text,
  referrer text,
  utm jsonb,
  properties jsonb,
  user_agent text,
  country text,
  ip_hash text,
  source text not null default 'web' check (source in ('web', 'server', 'whatsapp')),
  created_at timestamptz not null default now()
);
create index on public.analytics_events(created_at desc);
create index on public.analytics_events(event, created_at desc);
create index on public.analytics_events(session_id, created_at desc);
create index on public.analytics_events(anon_id);
alter table public.analytics_events enable row level security;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  source text not null
    check (source in ('out_of_area', 'chat_handoff', 'quote', 'newsletter', 'contact')),
  name text,
  email text,
  phone text,
  commune text,
  region text default 'Región Metropolitana',
  service_slug text,
  square_meters integer,
  quote_amount_clp integer,
  address_line text,
  lat numeric(9, 6),
  lng numeric(9, 6),
  message text,
  status text not null default 'new' check (status in ('new', 'contacted', 'converted', 'lost')),
  customer_id uuid references public.customers(id) on delete set null,
  session_id text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.leads(status, created_at desc);
create index on public.leads(source, created_at desc);
create index on public.leads(created_at desc);
alter table public.leads enable row level security;

create trigger leads_updated_at
  before update on public.leads
  for each row execute function public.tg_set_updated_at();

create or replace function public.admin_traffic(p_days int default 30)
returns table(pageviews bigint, visitors bigint, sessions bigint, events bigint)
language sql stable as $$
  select
    count(*) filter (where event = '$pageview')::bigint,
    count(distinct anon_id)::bigint,
    count(distinct session_id)::bigint,
    count(*)::bigint
  from public.analytics_events
  where created_at >= now() - make_interval(days => p_days);
$$;

create or replace function public.admin_event_counts(p_days int default 30)
returns table(event text, count bigint)
language sql stable as $$
  select event, count(*)::bigint
  from public.analytics_events
  where created_at >= now() - make_interval(days => p_days)
  group by event
  order by count(*) desc;
$$;

create or replace function public.admin_daily_events(p_days int default 14)
returns table(day date, count bigint)
language sql stable as $$
  select date_trunc('day', created_at at time zone 'America/Santiago')::date as day, count(*)::bigint
  from public.analytics_events
  where created_at >= now() - make_interval(days => p_days)
  group by 1
  order by 1;
$$;
