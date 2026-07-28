-- Properties are a strict mirror of the host's Hospitable account: listing
-- attributes come from the API, not manual entry. Add the columns the
-- Hospitable Public API v2 exposes per property (shape captured live 2026-07)
-- so the mirror carries the full listing record.
alter table public.properties
  add column if not exists picture_url text,
  add column if not exists max_guests int,
  add column if not exists beds int,
  add column if not exists property_type text,
  add column if not exists room_type text,
  add column if not exists checkin_time text,
  add column if not exists checkout_time text,
  add column if not exists listed boolean not null default true,
  add column if not exists amenities jsonb,
  add column if not exists house_rules jsonb;

-- The mirror upserts atomically on (owner_id, external_listing_id); dedupe any
-- historical duplicates (keep the oldest row — it holds the children), then add
-- the unique index. NULL external ids stay unconstrained (Postgres treats NULLs
-- as distinct) — those rows are pruned by the mirror anyway.
delete from public.properties a
  using public.properties b
  where a.external_listing_id is not null
    and a.owner_id = b.owner_id
    and a.external_listing_id = b.external_listing_id
    and (a.created_at > b.created_at or (a.created_at = b.created_at and a.ctid > b.ctid));

create unique index if not exists properties_owner_external_listing_key
  on public.properties (owner_id, external_listing_id);
