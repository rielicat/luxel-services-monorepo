-- 0005_booking_frequency.sql — remember the plan cadence chosen at booking time
--
-- A booking is a single visit; a recurring plan is a subscription (the parent of its
-- visit bookings, via bookings.subscription_id). The chosen frequency lived only in the
-- analytics event, so the payment-confirmation layer had no way to know a paid booking was
-- meant to start a plan. Persist it here (default 'one_time' — legacy rows are one-offs) so
-- the webhooks / dev mock can promote a paid recurring booking into a subscription.

alter table public.bookings
  add column if not exists frequency text not null default 'one_time'
    check (frequency in ('one_time', 'weekly', 'biweekly', 'monthly'));
