-- Who runs the turnover cleaning for each property: Luxel's crew (default) or
-- the host's own staff, with the contact Luxel notifies automatically when a
-- cleaning is confirmed.
alter table public.properties
  add column if not exists cleaning_managed_by text not null default 'luxel'
    check (cleaning_managed_by in ('luxel', 'own')),
  add column if not exists cleaning_contact_name text,
  add column if not exists cleaning_contact_email text,
  add column if not exists cleaning_contact_whatsapp text;
