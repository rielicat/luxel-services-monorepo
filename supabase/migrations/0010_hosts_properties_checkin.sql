-- Pivot Phase 0 + first slice: a Luxel "customer" is now a HOST who owns
-- properties (listings). Each property has one access method that decides who
-- gets notified when a guest submits their check-in, and guest check-ins are
-- collected through an unguessable per-stay link.

create type public.access_method as enum ('keyless', 'physical_concierge', 'physical_none');
create type public.checkin_status as enum ('pending', 'submitted', 'notified', 'failed');

-- ───── properties (listings) ─────────────────────────────────
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.customers(id) on delete cascade,
  nickname text not null,
  address text,
  comuna text,
  bedrooms int,
  bathrooms int,
  size_m2 numeric,            -- feeds the cleaning calculator (Plan B turnover price)
  platform text not null default 'airbnb',
  external_listing_id text,   -- set once a PMS/channel adapter is connected (Phase 2)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.properties(owner_id);
alter table public.properties enable row level security;
create policy "properties_owner_all"
  on public.properties for all
  using (owner_id in (select id from public.customers where clerk_user_id = (auth.jwt() ->> 'sub')))
  with check (owner_id in (select id from public.customers where clerk_user_id = (auth.jwt() ->> 'sub')));

-- ───── per-property access configuration ─────────────────────
-- 'physical_none' is the onboarding blocker: a physical key with no 24/7
-- conserjería can't be automated, so self-check-in is disabled until the host
-- switches to a keyless lock or names a concierge to release the key.
create table public.property_access (
  property_id uuid primary key references public.properties(id) on delete cascade,
  method public.access_method not null default 'physical_none',
  keyless_code text,             -- static for MVP; smart-lock issuance comes later
  keyless_instructions text,
  concierge_name text,
  concierge_whatsapp text,       -- E.164
  concierge_email text,
  concierge_hours text,
  notes text,
  -- Guest-ID requirement is OFF by default. AirBnB's off-platform policy only lets
  -- a host REQUIRE ID with a genuine legal/compliance basis disclosed in the listing
  -- before booking, and Chilean law doesn't mandate collecting it — so a host turns
  -- this on per property only when both hold. Elsewhere ID is an optional ask.
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

-- ───── guest check-ins ───────────────────────────────────────
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  token text not null unique,          -- unguessable link the guest opens
  status public.checkin_status not null default 'pending',
  guest_name text,
  guest_email text,
  guest_phone text,                    -- E.164; used to send the keyless code / confirmation
  party_size int,
  arrival_at timestamptz,
  notes text,
  notify_result jsonb,                 -- per-channel send outcome
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  notified_at timestamptz
);
create index on public.checkins(property_id);
create index on public.checkins(token);
alter table public.checkins enable row level security;
-- Hosts read check-ins for their own properties. The guest submits through a
-- service-role server action authenticated by the token (RLS bypassed), so there
-- is deliberately no anonymous insert/update policy here.
create policy "checkins_owner_read"
  on public.checkins for select
  using (property_id in (
    select p.id from public.properties p
    join public.customers c on c.id = p.owner_id
    where c.clerk_user_id = (auth.jwt() ->> 'sub')));

-- ───── guest identity (segregated + minimized, Ley 21.719-aligned) ────
-- Collecting guest ID is NOT a Chilean legal mandate (Ley 21.325 repealed the old
-- lodging/albergue duty), so the lawful basis is contract performance + legitimate
-- interest — which means we must minimize. Discrete fields only; the document number
-- is stored ENCRYPTED (app-layer, never plaintext); NO ID image is ever persisted
-- (images are OCR'd transiently in the app and discarded); and purge_after drives
-- automatic deletion of identity ~90 days after the stay. Kept in its own table so
-- retention/erasure and access are scoped tightly.
create table public.checkin_identity (
  checkin_id uuid primary key references public.checkins(id) on delete cascade,
  doc_type text not null,              -- 'rut' | 'passport' | 'dni' | ...
  doc_number_enc text not null,        -- ciphertext; the plaintext number is never stored
  doc_last4 text,                      -- host-facing display/reference only
  nationality text,
  date_of_birth date,
  verified boolean not null default false,
  purge_after timestamptz not null,    -- a scheduled job deletes rows past this
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
