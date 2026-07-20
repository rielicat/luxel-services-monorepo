-- Per-guest check-in details: the person completing check-in registers EVERY
-- incoming guest (lead + companions). Same minimization/encryption scheme as
-- checkin_identity: doc number encrypted app-layer, last-4 for display, purged
-- alongside the check-in's retention window.
create table public.checkin_guests (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  is_lead boolean not null default false,
  full_name text not null,
  doc_type text,
  doc_number_enc text,
  doc_last4 text,
  created_at timestamptz not null default now()
);
create index on public.checkin_guests(checkin_id);
alter table public.checkin_guests enable row level security;
create policy "checkin_guests_owner_read"
  on public.checkin_guests for select
  using (checkin_id in (
    select ch.id from public.checkins ch
    join public.properties p on p.id = ch.property_id
    join public.customers c on c.id = p.owner_id
    where c.clerk_user_id = (auth.jwt() ->> 'sub')));
