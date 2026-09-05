drop function if exists public.lux_search_digests(uuid, text, vector, integer);

create or replace function public.lux_search_digests(
  p_property_id uuid,
  p_query text,
  p_embedding vector(1536),
  p_limit integer,
  p_surface text default null
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
      and (p_surface is null or d.surface = p_surface)
      and public.lux_any_tsquery(p_query) is not null
      and d.fts @@ public.lux_any_tsquery(p_query)
    limit p_limit * 4
  ),
  semantic as (
    select d.id,
           row_number() over (order by d.embedding <=> p_embedding) as pos
    from public.lux_conversation_digest d
    where (p_property_id is null or d.property_id = p_property_id)
      and (p_surface is null or d.surface = p_surface)
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

create index if not exists lux_conversation_digest_surface_idx
  on public.lux_conversation_digest (surface, property_id);
