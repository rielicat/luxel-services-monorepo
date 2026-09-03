alter table public.bookings
  add column if not exists frequency text not null default 'one_time'
    check (frequency in ('one_time', 'weekly', 'biweekly', 'monthly'));
