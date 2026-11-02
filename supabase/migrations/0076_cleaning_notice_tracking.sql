alter table public.cleanings add column if not exists notified_at timestamptz;
alter table public.cleanings add column if not exists reminded_at timestamptz;

create index if not exists cleanings_pending_reminder_idx
  on public.cleanings (cleaning_date)
  where reminded_at is null;

notify pgrst, 'reload schema';
