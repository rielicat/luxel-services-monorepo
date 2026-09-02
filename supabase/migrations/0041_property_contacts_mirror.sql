alter table public.property_contacts
  add column if not exists external_id text;
alter table public.property_contacts
  alter column whatsapp drop not null;
create unique index if not exists property_contacts_mirror_key
  on public.property_contacts (property_id, role, external_id);
