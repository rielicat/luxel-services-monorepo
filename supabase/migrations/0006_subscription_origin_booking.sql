alter table public.subscriptions
  add column if not exists origin_booking_id uuid references public.bookings(id) on delete set null;

create unique index if not exists subscriptions_origin_booking_id_key
  on public.subscriptions(origin_booking_id)
  where origin_booking_id is not null;
