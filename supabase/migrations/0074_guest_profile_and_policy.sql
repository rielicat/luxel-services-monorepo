alter table public.guest_threads
  add column if not exists guest_external_id text;

create index if not exists guest_threads_guest_external_idx
  on public.guest_threads(guest_external_id);

create table if not exists public.luxel_policy (
  id boolean primary key default true,
  body text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint luxel_policy_singleton check (id)
);

alter table public.luxel_policy enable row level security;

insert into public.luxel_policy (id, body) values (true, '')
  on conflict (id) do nothing;

notify pgrst, 'reload schema';
