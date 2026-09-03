update public.plan_subscriptions set plan = 'commission' where plan <> 'commission';

alter table public.plan_subscriptions drop constraint if exists plan_subscriptions_plan_check;
alter table public.plan_subscriptions
  add constraint plan_subscriptions_plan_check check (plan = 'commission');
