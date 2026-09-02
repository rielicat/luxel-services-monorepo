alter table public.subscriptions drop column if exists provider_subscription_id;
alter table public.bookings drop column if exists operator_id;
alter table public.plan_subscriptions drop column if exists provider_ref;

alter table public.property_addons
  drop column if exists provider,
  drop column if exists provider_ref;
