-- Price optimization is opt-in per property, alongside AI replies as the two
-- headline automations.
alter table public.properties
  add column if not exists price_optimization_enabled boolean not null default false;

-- Cleaning notifications go to a LIST of people the host manages, not a single
-- hardcoded contact.
create table if not exists public.cleaning_contacts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  name text,
  email text,
  whatsapp text,
  created_at timestamptz not null default now()
);
create index if not exists cleaning_contacts_property_idx
  on public.cleaning_contacts (property_id);
alter table public.cleaning_contacts enable row level security;
drop policy if exists "cleaning_contacts_owner_all" on public.cleaning_contacts;
create policy "cleaning_contacts_owner_all"
  on public.cleaning_contacts for all
  using (property_id in (
    select p.id from public.properties p join public.customers c on c.id = p.owner_id
    where c.clerk_user_id = (auth.jwt() ->> 'sub')))
  with check (property_id in (
    select p.id from public.properties p join public.customers c on c.id = p.owner_id
    where c.clerk_user_id = (auth.jwt() ->> 'sub')));

-- Carry over the single legacy contact where one was configured.
insert into public.cleaning_contacts (property_id, name, email, whatsapp)
select id, cleaning_contact_name, cleaning_contact_email, cleaning_contact_whatsapp
from public.properties
where (cleaning_contact_email is not null or cleaning_contact_whatsapp is not null)
  and not exists (select 1 from public.cleaning_contacts cc where cc.property_id = properties.id);
