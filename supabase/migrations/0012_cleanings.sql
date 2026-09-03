alter table public.properties add column lat double precision;
alter table public.properties add column lng double precision;

create table public.cleanings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  cleaning_date date not null,
  status text not null default 'suggested' check (status in ('suggested', 'scheduled', 'done', 'skipped')),
  price_clp integer,
  source text not null default 'checkout' check (source in ('checkout', 'manual')),
  created_at timestamptz not null default now(),
  unique (property_id, cleaning_date)
);
create index on public.cleanings(property_id, cleaning_date);
alter table public.cleanings enable row level security;
create policy "cleanings_owner_all"
  on public.cleanings for all
  using (property_id in (
    select p.id from public.properties p join public.customers c on c.id = p.owner_id
    where c.clerk_user_id = (auth.jwt() ->> 'sub')))
  with check (property_id in (
    select p.id from public.properties p join public.customers c on c.id = p.owner_id
    where c.clerk_user_id = (auth.jwt() ->> 'sub')));
