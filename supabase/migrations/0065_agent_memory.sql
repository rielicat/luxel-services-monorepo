create extension if not exists "vector";
create extension if not exists "pg_trgm";

create table if not exists public.lux_memory_note (
  id uuid primary key default gen_random_uuid(),
  tier text not null,
  scope_key text not null,
  note_key text,
  body text not null,
  weight integer not null default 0,
  source text not null default 'distilled',
  property_id uuid references public.properties(id) on delete cascade,
  embedding vector(1536),
  fts tsvector generated always as (to_tsvector('spanish', body)) stored,
  uses integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lux_memory_note
  drop constraint if exists lux_memory_note_tier_check;
alter table public.lux_memory_note
  add constraint lux_memory_note_tier_check
  check (tier in ('global', 'property', 'host'));

alter table public.lux_memory_note
  drop constraint if exists lux_memory_note_source_check;
alter table public.lux_memory_note
  add constraint lux_memory_note_source_check
  check (source in ('distilled', 'operator', 'agent', 'pricing'));

alter table public.lux_memory_note
  drop constraint if exists lux_memory_note_property_tier_check;
alter table public.lux_memory_note
  add constraint lux_memory_note_property_tier_check
  check (tier <> 'property' or property_id is not null);

create unique index if not exists lux_memory_note_scope_key_idx
  on public.lux_memory_note (scope_key, note_key);
create index if not exists lux_memory_note_tier_weight_idx
  on public.lux_memory_note (tier, scope_key, weight desc);
create index if not exists lux_memory_note_fts_idx
  on public.lux_memory_note using gin (fts);
create index if not exists lux_memory_note_embedding_idx
  on public.lux_memory_note using hnsw (embedding vector_cosine_ops);

drop trigger if exists lux_memory_note_updated_at on public.lux_memory_note;
create trigger lux_memory_note_updated_at
  before update on public.lux_memory_note
  for each row execute function public.tg_set_updated_at();

alter table public.lux_memory_note enable row level security;

create table if not exists public.lux_conversation_digest (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  operation_id text not null unique,
  surface text not null,
  property_id uuid references public.properties(id) on delete cascade,
  thread_id uuid references public.guest_threads(id) on delete cascade,
  summary text not null,
  facts jsonb not null default '[]'::jsonb,
  outcome text,
  distilled_at timestamptz,
  embedding vector(1536),
  fts tsvector generated always as (to_tsvector('spanish', summary)) stored,
  created_at timestamptz not null default now()
);

alter table public.lux_conversation_digest
  drop constraint if exists lux_conversation_digest_surface_check;
alter table public.lux_conversation_digest
  add constraint lux_conversation_digest_surface_check
  check (surface in ('web', 'guest'));

alter table public.lux_conversation_digest
  drop constraint if exists lux_conversation_digest_facts_check;
alter table public.lux_conversation_digest
  add constraint lux_conversation_digest_facts_check
  check (jsonb_typeof(facts) = 'array');

create index if not exists lux_conversation_digest_property_idx
  on public.lux_conversation_digest (property_id, created_at desc);
create index if not exists lux_conversation_digest_pending_idx
  on public.lux_conversation_digest (created_at desc)
  where distilled_at is null;
create index if not exists lux_conversation_digest_fts_idx
  on public.lux_conversation_digest using gin (fts);
create index if not exists lux_conversation_digest_embedding_idx
  on public.lux_conversation_digest using hnsw (embedding vector_cosine_ops);

alter table public.lux_conversation_digest enable row level security;

create table if not exists public.lux_agent_session (
  session_id text primary key,
  principal_id text not null,
  surface text not null,
  property_id uuid references public.properties(id) on delete cascade,
  thread_id uuid references public.guest_threads(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lux_agent_session
  drop constraint if exists lux_agent_session_surface_check;
alter table public.lux_agent_session
  add constraint lux_agent_session_surface_check
  check (surface in ('web', 'guest'));

create index if not exists lux_agent_session_principal_idx
  on public.lux_agent_session (principal_id, created_at desc);

drop trigger if exists lux_agent_session_updated_at on public.lux_agent_session;
create trigger lux_agent_session_updated_at
  before update on public.lux_agent_session
  for each row execute function public.tg_set_updated_at();

alter table public.lux_agent_session enable row level security;

create or replace function public.lux_any_tsquery(p_query text)
returns tsquery
language sql
immutable
as $$
  select nullif(
    replace(websearch_to_tsquery('spanish', p_query)::text, ' & ', ' | '),
    ''
  )::tsquery;
$$;

create or replace function public.lux_search_notes(
  p_scope_key text,
  p_query text,
  p_embedding vector(1536),
  p_limit integer
)
returns table (id uuid, note_key text, body text, rank double precision)
language sql
stable
as $$
  with lexical as (
    select n.id,
           row_number() over (
             order by ts_rank(n.fts, public.lux_any_tsquery(p_query)) desc
           ) as pos
    from public.lux_memory_note n
    where n.scope_key = p_scope_key
      and public.lux_any_tsquery(p_query) is not null
      and n.fts @@ public.lux_any_tsquery(p_query)
    limit p_limit * 4
  ),
  semantic as (
    select n.id,
           row_number() over (order by n.embedding <=> p_embedding) as pos
    from public.lux_memory_note n
    where n.scope_key = p_scope_key
      and p_embedding is not null
      and n.embedding is not null
    limit p_limit * 4
  ),
  fused as (
    select coalesce(l.id, s.id) as id,
           coalesce(1.0 / (60 + l.pos), 0.0) + coalesce(1.0 / (60 + s.pos), 0.0) as rank
    from lexical l
    full outer join semantic s on s.id = l.id
  )
  select n.id, n.note_key, n.body, f.rank
  from fused f
  join public.lux_memory_note n on n.id = f.id
  order by f.rank desc, n.weight desc
  limit p_limit;
$$;

create or replace function public.lux_search_digests(
  p_property_id uuid,
  p_query text,
  p_embedding vector(1536),
  p_limit integer
)
returns table (id uuid, summary text, rank double precision)
language sql
stable
as $$
  with lexical as (
    select d.id,
           row_number() over (
             order by ts_rank(d.fts, public.lux_any_tsquery(p_query)) desc
           ) as pos
    from public.lux_conversation_digest d
    where (p_property_id is null or d.property_id = p_property_id)
      and public.lux_any_tsquery(p_query) is not null
      and d.fts @@ public.lux_any_tsquery(p_query)
    limit p_limit * 4
  ),
  semantic as (
    select d.id,
           row_number() over (order by d.embedding <=> p_embedding) as pos
    from public.lux_conversation_digest d
    where (p_property_id is null or d.property_id = p_property_id)
      and p_embedding is not null
      and d.embedding is not null
    limit p_limit * 4
  ),
  fused as (
    select coalesce(l.id, s.id) as id,
           coalesce(1.0 / (60 + l.pos), 0.0) + coalesce(1.0 / (60 + s.pos), 0.0) as rank
    from lexical l
    full outer join semantic s on s.id = l.id
  )
  select d.id, d.summary, f.rank
  from fused f
  join public.lux_conversation_digest d on d.id = f.id
  order by f.rank desc, d.created_at desc
  limit p_limit;
$$;

revoke all on function public.lux_any_tsquery(text) from anon, authenticated;
revoke all on function public.lux_search_notes(text, text, vector, integer) from anon, authenticated;
revoke all on function public.lux_search_digests(uuid, text, vector, integer) from anon, authenticated;
