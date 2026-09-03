alter table public.properties
  add column if not exists checkin_links_backfilled_at timestamptz;
