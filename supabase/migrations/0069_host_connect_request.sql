alter table public.host_connection
  add column if not exists requested_at timestamptz;

create index if not exists host_connection_requested_idx
  on public.host_connection (requested_at)
  where requested_at is not null and state = 'not_started';

create table if not exists public.host_setup_task (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  kind text not null,
  status text not null default 'queued',
  attempts int not null default 0,
  claimed_at timestamptz,
  done_at timestamptz,
  detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.host_setup_task drop constraint if exists host_setup_task_kind_check;
alter table public.host_setup_task
  add constraint host_setup_task_kind_check
  check (kind in ('dynamic_pricing', 'cohost', 'payout_split'));

alter table public.host_setup_task drop constraint if exists host_setup_task_status_check;
alter table public.host_setup_task
  add constraint host_setup_task_status_check
  check (status in ('queued', 'running', 'done', 'failed', 'skipped'));

create unique index if not exists host_setup_task_unique_idx
  on public.host_setup_task (customer_id, property_id, kind);

create index if not exists host_setup_task_queue_idx
  on public.host_setup_task (status, created_at)
  where status in ('queued', 'running');

alter table public.host_setup_task enable row level security;
