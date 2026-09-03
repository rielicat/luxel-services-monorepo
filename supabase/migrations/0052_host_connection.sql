create table if not exists public.host_connection (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  state text not null default 'not_started',
  claimed_airbnb_email text,
  claimed_at timestamptz,
  invite_url text,
  invite_sent_at timestamptz,
  connecting_at timestamptz,
  connected_at timestamptz,
  no_listings_at timestamptz,
  needs_operator_at timestamptz,
  channel_user_id text,
  last_checked_at timestamptz,
  operator_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.host_connection drop constraint if exists host_connection_state_check;
alter table public.host_connection
  add constraint host_connection_state_check
  check (state in (
    'not_started', 'invite_sent', 'connecting', 'connected', 'no_listings', 'needs_operator'));

create index if not exists host_connection_claimed_email_idx
  on public.host_connection (claimed_airbnb_email)
  where claimed_airbnb_email is not null;
create index if not exists host_connection_channel_user_idx
  on public.host_connection (channel_user_id)
  where channel_user_id is not null;
create index if not exists host_connection_state_idx
  on public.host_connection (state);

alter table public.host_connection enable row level security;
drop policy if exists "host_connection_self_read" on public.host_connection;
create policy "host_connection_self_read"
  on public.host_connection for select
  using (customer_id in (
    select c.id from public.customers c where c.clerk_user_id = (auth.jwt() ->> 'sub')));

drop trigger if exists host_connection_updated_at on public.host_connection;
create trigger host_connection_updated_at
  before update on public.host_connection
  for each row execute function public.tg_set_updated_at();
