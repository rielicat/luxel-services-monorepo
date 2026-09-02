alter table public.checkins
  add column if not exists arrival_time text,
  add column if not exists departure_time text,
  drop column if exists arrival_at;

alter table public.checkin_guests add column if not exists nationality text;
