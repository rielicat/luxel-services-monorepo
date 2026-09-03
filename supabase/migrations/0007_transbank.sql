alter table public.bookings drop constraint if exists bookings_payment_provider_check;
alter table public.bookings add constraint bookings_payment_provider_check
  check (payment_provider in ('stripe', 'mercadopago', 'transbank'));

alter table public.subscriptions drop constraint if exists subscriptions_payment_provider_check;
alter table public.subscriptions add constraint subscriptions_payment_provider_check
  check (payment_provider in ('stripe', 'mercadopago', 'transbank'));

alter table public.payment_events drop constraint if exists payment_events_provider_check;
alter table public.payment_events add constraint payment_events_provider_check
  check (provider in ('stripe', 'mercadopago', 'transbank'));
