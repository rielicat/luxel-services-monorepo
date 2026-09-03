create table if not exists public.property_addons (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  addon text not null,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  price_clp integer not null check (price_clp >= 0),
  activated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  provider text,
  provider_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, addon)
);
create index if not exists property_addons_property_idx on public.property_addons (property_id);
alter table public.property_addons enable row level security;
drop policy if exists "property_addons_owner_all" on public.property_addons;
drop policy if exists "property_addons_owner_read" on public.property_addons;
create policy "property_addons_owner_read"
  on public.property_addons for select
  using (property_id in (
    select p.id from public.properties p join public.customers c on c.id = p.owner_id
    where c.clerk_user_id = (auth.jwt() ->> 'sub')));

alter table public.properties
  add column if not exists pricelabs_status text not null default 'off'
    check (pricelabs_status in ('off', 'pending_connection', 'connected'));
alter table public.properties add column if not exists pricelabs_listing_id text;
