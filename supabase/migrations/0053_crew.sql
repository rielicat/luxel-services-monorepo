create table if not exists public.crew_member (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'internal',
  name text not null,
  whatsapp text,
  email text,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crew_member drop constraint if exists crew_member_kind_check;
alter table public.crew_member
  add constraint crew_member_kind_check check (kind in ('internal', 'external'));

create index if not exists crew_member_active_idx
  on public.crew_member (active, kind);

create table if not exists public.crew_assignment (
  id uuid primary key default gen_random_uuid(),
  crew_member_id uuid not null references public.crew_member(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now()
);

alter table public.crew_assignment drop constraint if exists crew_assignment_role_check;
alter table public.crew_assignment
  add constraint crew_assignment_role_check check (role in ('cleaning', 'concierge'));

create unique index if not exists crew_assignment_key
  on public.crew_assignment (crew_member_id, property_id, role);
create index if not exists crew_assignment_property_role_idx
  on public.crew_assignment (property_id, role);

alter table public.crew_member enable row level security;
alter table public.crew_assignment enable row level security;

drop trigger if exists crew_member_updated_at on public.crew_member;
create trigger crew_member_updated_at
  before update on public.crew_member
  for each row execute function public.tg_set_updated_at();
