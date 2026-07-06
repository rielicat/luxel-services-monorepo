-- 0006_subscription_origin_booking.sql — one subscription per originating booking
--
-- A subscription is born from the first paid visit of a recurring plan. The emitter runs
-- from payment-confirmation paths that can be delivered more than once (provider retries,
-- a re-hit dev checkout), so without a DB-level guarantee a race could create two plans for
-- one booking. Record which booking created the subscription and make it unique, so the
-- emitter can treat a duplicate delivery as a no-op instead of inserting a second row.

alter table public.subscriptions
  add column if not exists origin_booking_id uuid references public.bookings(id) on delete set null;

create unique index if not exists subscriptions_origin_booking_id_key
  on public.subscriptions(origin_booking_id)
  where origin_booking_id is not null;
