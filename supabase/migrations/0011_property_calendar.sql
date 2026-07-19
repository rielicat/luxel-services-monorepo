-- Property calendar (availability only — no guest data). Import busy periods from
-- AirBnB/Booking/Vrbo iCal feeds, plus host "I'm using it" manual blocks, and
-- re-export everything as one Luxel iCal feed those platforms import back.

create table public.property_calendars (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  label text not null default 'airbnb',
  ical_url text not null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.property_calendars(property_id);
alter table public.property_calendars enable row level security;
create policy "property_calendars_owner_all"
  on public.property_calendars for all
  using (property_id in (
    select p.id from public.properties p join public.customers c on c.id = p.owner_id
    where c.clerk_user_id = (auth.jwt() ->> 'sub')))
  with check (property_id in (
    select p.id from public.properties p join public.customers c on c.id = p.owner_id
    where c.clerk_user_id = (auth.jwt() ->> 'sub')));

create table public.calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,               -- exclusive end (iCal DTEND convention)
  source text not null check (source in ('import', 'manual')),
  summary text,
  external_uid text,                   -- iCal UID; dedups imported events per property
  created_at timestamptz not null default now(),
  unique (property_id, external_uid)   -- NULLs are distinct, so manual blocks never collide
);
create index on public.calendar_blocks(property_id, starts_on);
alter table public.calendar_blocks enable row level security;
create policy "calendar_blocks_owner_all"
  on public.calendar_blocks for all
  using (property_id in (
    select p.id from public.properties p join public.customers c on c.id = p.owner_id
    where c.clerk_user_id = (auth.jwt() ->> 'sub')))
  with check (property_id in (
    select p.id from public.properties p join public.customers c on c.id = p.owner_id
    where c.clerk_user_id = (auth.jwt() ->> 'sub')));

-- Unguessable token for the property's outbound iCal feed URL.
alter table public.properties add column ical_token text unique;
