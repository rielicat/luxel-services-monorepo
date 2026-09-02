alter table public.cleanings add column if not exists crew_declined_at timestamptz;
alter table public.checkins drop column if exists crew_notified_at;
