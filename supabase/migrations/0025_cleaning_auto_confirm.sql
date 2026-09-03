alter table public.properties
  add column if not exists cleaning_auto_confirm boolean not null default true;
