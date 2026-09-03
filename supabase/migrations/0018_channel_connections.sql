create table public.channel_connections (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  provider text not null default 'hospitable' check (provider in ('hospitable', 'beds24')),
  token_enc text not null,
  account_label text,
  status text not null default 'connected' check (status in ('connected', 'error')),
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  unique (customer_id, provider)
);
alter table public.channel_connections enable row level security;
create policy "channel_connections_self_read"
  on public.channel_connections for select
  using (customer_id in (select id from public.customers where clerk_user_id = (auth.jwt() ->> 'sub')));
