create type public.access_method as enum ('keyless', 'physical_concierge', 'physical_none');
create type public.checkin_status as enum ('pending', 'submitted', 'notified', 'failed');

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.customers(id) on delete cascade,
  nickname text not null,
  address text,
  comuna text,
  bedrooms int,
  bathrooms int,
  size_m2 numeric,
  platform text not null default 'airbnb',
  external_listing_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.properties(owner_id);
alter table public.properties enable row level security;
create policy "properties_owner_all"
  on public.properties for all
  using (owner_id in (select id from public.customers where clerk_user_id = (auth.jwt() ->> 'sub')))
  with check (owner_id in (select id from public.customers where clerk_user_id = (auth.jwt() ->> 'sub')));

create table public.property_access (
  property_id uuid primary key references public.properties(id) on delete cascade,
  method public.access_method not null default 'physical_none',
  keyless_code text,
  keyless_instructions text,
  concierge_name text,
  concierge_whatsapp text,
  concierge_email text,
  concierge_hours text,
  notes text,
  require_id boolean not null default false,
  id_basis text,
  id_disclosed boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.property_access enable row level security;
create policy "property_access_owner_all"
  on public.property_access for all
  using (property_id in (
    select p.id from public.properties p
    join public.customers c on c.id = p.owner_id
    where c.clerk_user_id = (auth.jwt() ->> 'sub')))
  with check (property_id in (
    select p.id from public.properties p
    join public.customers c on c.id = p.owner_id
    where c.clerk_user_id = (auth.jwt() ->> 'sub')));

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  token text not null unique,
  status public.checkin_status not null default 'pending',
  guest_name text,
  guest_email text,
  guest_phone text,
  party_size int,
  arrival_at timestamptz,
  notes text,
  notify_result jsonb,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  notified_at timestamptz
);
create index on public.checkins(property_id);
create index on public.checkins(token);
alter table public.checkins enable row level security;
create policy "checkins_owner_read"
  on public.checkins for select
  using (property_id in (
    select p.id from public.properties p
    join public.customers c on c.id = p.owner_id
    where c.clerk_user_id = (auth.jwt() ->> 'sub')));

create table public.checkin_identity (
  checkin_id uuid primary key references public.checkins(id) on delete cascade,
  doc_type text not null,
  doc_number_enc text not null,
  doc_last4 text,
  nationality text,
  date_of_birth date,
  verified boolean not null default false,
  purge_after timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.checkin_identity enable row level security;
create policy "checkin_identity_owner_read"
  on public.checkin_identity for select
  using (checkin_id in (
    select ch.id from public.checkins ch
    join public.properties p on p.id = ch.property_id
    join public.customers c on c.id = p.owner_id
    where c.clerk_user_id = (auth.jwt() ->> 'sub')));
