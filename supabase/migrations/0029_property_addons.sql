-- Paid extras layered on top of the flat per-listing management fee. One row
-- per (property, addon); `price_clp` snapshots what the host agreed to pay so
-- a later catalogue change never silently reprices an active add-on.
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
-- READ-ONLY for hosts (same lockdown as 0008): this table decides whether a
-- paid feature is unlocked and at what price, and every legitimate read and
-- write goes through the service-role client, which bypasses RLS. Write access
-- here would let a host POST {status:'active', price_clp:0} for their own
-- property and unlock the add-on for free.
drop policy if exists "property_addons_owner_all" on public.property_addons;
drop policy if exists "property_addons_owner_read" on public.property_addons;
create policy "property_addons_owner_read"
  on public.property_addons for select
  using (property_id in (
    select p.id from public.properties p join public.customers c on c.id = p.owner_id
    where c.clerk_user_id = (auth.jwt() ->> 'sub')));

-- Dynamic pricing is delivered through PriceLabs; the host has to authorise
-- the connection on their side, so we track where each listing is in that
-- handshake instead of pretending it is instant.
alter table public.properties
  add column if not exists pricelabs_status text not null default 'off'
    check (pricelabs_status in ('off', 'pending_connection', 'connected'));
alter table public.properties add column if not exists pricelabs_listing_id text;
