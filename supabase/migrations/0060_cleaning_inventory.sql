create table if not exists public.cleaning_checklist (
  id uuid primary key default gen_random_uuid(),
  cleaning_id uuid not null unique references public.cleanings(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  done_steps text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cleaning_inventory_draft (
  id uuid primary key default gen_random_uuid(),
  cleaning_id uuid not null unique references public.cleanings(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  walkthrough_id uuid references public.cleaning_walkthrough(id) on delete set null,
  status text not null default 'pending',
  items jsonb not null default '[]'::jsonb,
  differences jsonb not null default '[]'::jsonb,
  model text,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cleaning_inventory_draft
  drop constraint if exists cleaning_inventory_draft_status_check;
alter table public.cleaning_inventory_draft
  add constraint cleaning_inventory_draft_status_check
  check (status in ('pending', 'ready', 'unavailable', 'failed'));

alter table public.cleaning_inventory_draft
  drop constraint if exists cleaning_inventory_draft_items_check;
alter table public.cleaning_inventory_draft
  add constraint cleaning_inventory_draft_items_check
  check (jsonb_typeof(items) = 'array' and jsonb_typeof(differences) = 'array');

create table if not exists public.cleaning_inventory (
  id uuid primary key default gen_random_uuid(),
  cleaning_id uuid not null unique references public.cleanings(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  draft_id uuid references public.cleaning_inventory_draft(id) on delete set null,
  source text not null,
  items jsonb not null default '[]'::jsonb,
  note text,
  confirmed_by_crew_member_id uuid references public.crew_member(id) on delete set null,
  confirmed_by_name text,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cleaning_inventory
  drop constraint if exists cleaning_inventory_source_check;
alter table public.cleaning_inventory
  add constraint cleaning_inventory_source_check
  check (source in ('ai', 'crew'));

alter table public.cleaning_inventory
  drop constraint if exists cleaning_inventory_items_check;
alter table public.cleaning_inventory
  add constraint cleaning_inventory_items_check
  check (jsonb_typeof(items) = 'array');

create index if not exists cleaning_inventory_draft_property_idx
  on public.cleaning_inventory_draft (property_id, updated_at desc);
create index if not exists cleaning_inventory_property_idx
  on public.cleaning_inventory (property_id, confirmed_at desc);

alter table public.cleaning_checklist enable row level security;
alter table public.cleaning_inventory_draft enable row level security;
alter table public.cleaning_inventory enable row level security;

drop trigger if exists cleaning_checklist_updated_at on public.cleaning_checklist;
create trigger cleaning_checklist_updated_at
  before update on public.cleaning_checklist
  for each row execute function public.tg_set_updated_at();

drop trigger if exists cleaning_inventory_draft_updated_at on public.cleaning_inventory_draft;
create trigger cleaning_inventory_draft_updated_at
  before update on public.cleaning_inventory_draft
  for each row execute function public.tg_set_updated_at();

drop trigger if exists cleaning_inventory_updated_at on public.cleaning_inventory;
create trigger cleaning_inventory_updated_at
  before update on public.cleaning_inventory
  for each row execute function public.tg_set_updated_at();
