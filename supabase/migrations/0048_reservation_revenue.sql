create table if not exists public.reservation_revenue (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  booking_key text not null,
  reservation_uid text not null,
  confirmation_code text,
  arrival_date date not null,
  departure_date date not null,
  nights integer not null default 0,
  currency text,
  host_revenue_clp integer,
  guest_total_clp integer,
  synced_at timestamptz not null default now()
);

create unique index if not exists reservation_revenue_booking_key
  on public.reservation_revenue (property_id, booking_key);
create index if not exists reservation_revenue_property_month
  on public.reservation_revenue (property_id, departure_date);

alter table public.reservation_revenue enable row level security;
drop policy if exists "reservation_revenue_owner_read" on public.reservation_revenue;
create policy "reservation_revenue_owner_read"
  on public.reservation_revenue for select
  using (property_id in (
    select p.id from public.properties p
    join public.customers c on c.id = p.owner_id
    where c.clerk_user_id = (auth.jwt() ->> 'sub')));
