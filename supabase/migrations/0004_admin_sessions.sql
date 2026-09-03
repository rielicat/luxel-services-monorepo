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
    bool_or(e.event in ('payment_succeeded', 'booking_created'))
  from public.analytics_events e
  where e.created_at >= now() - make_interval(days => p_days)
    and e.session_id is not null
  group by e.session_id
  order by max(e.created_at) desc
  limit p_limit;
$$;
