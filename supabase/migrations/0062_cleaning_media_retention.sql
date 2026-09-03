create table if not exists public.media_tombstone (
  id uuid primary key default gen_random_uuid(),
  object_key text not null unique,
  created_at timestamptz not null default now()
);

alter table public.media_tombstone enable row level security;

create index if not exists media_tombstone_created_idx
  on public.media_tombstone (created_at);

create or replace function public.tg_walkthrough_tombstone()
returns trigger language plpgsql as $$
begin
  if old.object_key is not null then
    insert into public.media_tombstone (object_key)
    values (old.object_key)
    on conflict (object_key) do nothing;
  end if;
  return old;
end;
$$;

drop trigger if exists cleaning_walkthrough_tombstone on public.cleaning_walkthrough;
create trigger cleaning_walkthrough_tombstone
  before delete on public.cleaning_walkthrough
  for each row execute function public.tg_walkthrough_tombstone();

alter table public.cleaning_inventory_draft
  add column if not exists retention_until timestamptz not null default (now() + interval '30 days');
alter table public.cleaning_inventory_draft
  add column if not exists purged_at timestamptz;

alter table public.cleaning_review
  add column if not exists retention_until timestamptz not null default (now() + interval '30 days');
alter table public.cleaning_review
  add column if not exists purged_at timestamptz;

create index if not exists cleaning_inventory_draft_retention_idx
  on public.cleaning_inventory_draft (retention_until)
  where purged_at is null;
create index if not exists cleaning_review_retention_idx
  on public.cleaning_review (retention_until)
  where purged_at is null;
