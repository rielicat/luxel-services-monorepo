alter table public.properties
  add column if not exists cleaning_managed_by text not null default 'luxel'
    check (cleaning_managed_by in ('luxel', 'own')),
  add column if not exists cleaning_contact_name text,
  add column if not exists cleaning_contact_email text,
  add column if not exists cleaning_contact_whatsapp text;
