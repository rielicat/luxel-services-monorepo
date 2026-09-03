create table if not exists public.cleaning_walkthrough (
  id uuid primary key default gen_random_uuid(),
  cleaning_id uuid not null references public.cleanings(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  status text not null default 'pending',
  object_key text,
  content_type text,
  bytes bigint,
  duration_seconds integer,
  recorded_by_crew_member_id uuid references public.crew_member(id) on delete set null,
  recorded_by_name text,
  recorded_at timestamptz,
  retention_until timestamptz not null default (now() + interval '30 days'),
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cleaning_walkthrough
  drop constraint if exists cleaning_walkthrough_status_check;
alter table public.cleaning_walkthrough
  add constraint cleaning_walkthrough_status_check
  check (status in ('pending', 'stored', 'purged', 'failed'));

alter table public.cleaning_walkthrough
  drop constraint if exists cleaning_walkthrough_bytes_check;
alter table public.cleaning_walkthrough
  add constraint cleaning_walkthrough_bytes_check
  check (bytes is null or bytes >= 0);

alter table public.cleaning_walkthrough
  drop constraint if exists cleaning_walkthrough_duration_check;
alter table public.cleaning_walkthrough
  add constraint cleaning_walkthrough_duration_check
  check (duration_seconds is null or duration_seconds >= 0);

alter table public.cleaning_walkthrough
  drop constraint if exists cleaning_walkthrough_key_prefix_check;
alter table public.cleaning_walkthrough
  add constraint cleaning_walkthrough_key_prefix_check
  check (object_key is null or object_key like 'walkthrough/%');

create unique index if not exists cleaning_walkthrough_object_key_idx
  on public.cleaning_walkthrough (object_key)
  where object_key is not null;
create index if not exists cleaning_walkthrough_cleaning_idx
  on public.cleaning_walkthrough (cleaning_id, created_at desc);
create index if not exists cleaning_walkthrough_property_idx
  on public.cleaning_walkthrough (property_id, recorded_at desc);
create index if not exists cleaning_walkthrough_retention_idx
  on public.cleaning_walkthrough (retention_until)
  where object_key is not null;

alter table public.cleaning_walkthrough enable row level security;

drop trigger if exists cleaning_walkthrough_updated_at on public.cleaning_walkthrough;
create trigger cleaning_walkthrough_updated_at
  before update on public.cleaning_walkthrough
  for each row execute function public.tg_set_updated_at();
