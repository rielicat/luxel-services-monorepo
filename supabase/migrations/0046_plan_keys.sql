alter table public.plan_subscriptions drop constraint if exists plan_subscriptions_plan_check;
alter table public.plan_subscriptions
  add constraint plan_subscriptions_plan_check check (plan in ('commission', 'hybrid', 'fixed'));
