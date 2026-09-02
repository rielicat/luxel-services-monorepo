drop table if exists public.property_calendars cascade;
drop table if exists public.faq_entries cascade;
drop table if exists public.checkin_identity cascade;

alter table public.properties
  drop column if exists ical_token,
  drop column if exists cleaning_contact_name,
  drop column if exists cleaning_contact_email,
  drop column if exists cleaning_contact_whatsapp;

alter table public.checkins
  drop column if exists notes,
  drop column if exists guest_first_name;

alter table public.property_access drop column if exists notes;
alter table public.pricing_config drop column if exists value_text;
alter table public.customers drop column if exists preferred_locale;
