create table if not exists public.checkin_draft (
  checkin_id uuid primary key references public.checkins(id) on delete cascade,
  rev integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.checkin_draft
  add column if not exists rev integer not null default 0;

create index if not exists checkin_draft_updated_idx
  on public.checkin_draft (updated_at desc);

alter table public.checkin_draft enable row level security;

drop trigger if exists checkin_draft_updated_at on public.checkin_draft;
create trigger checkin_draft_updated_at
  before update on public.checkin_draft
  for each row execute function public.tg_set_updated_at();
