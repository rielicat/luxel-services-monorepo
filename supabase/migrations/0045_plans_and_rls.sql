alter table public.plan_subscriptions drop constraint if exists plan_subscriptions_plan_check;
alter table public.plan_subscriptions drop constraint if exists plan_subscriptions_status_check;
update public.plan_subscriptions set plan = 'fixed' where plan in ('ai', 'ai_cleaning');
update public.plan_subscriptions set status = 'requested' where status = 'trialing';
alter table public.plan_subscriptions drop column if exists trial_ends_at;
alter table public.plan_subscriptions alter column status set default 'requested';
alter table public.plan_subscriptions
  add constraint plan_subscriptions_plan_check check (plan in ('fixed', 'hybrid', 'commission'));
alter table public.plan_subscriptions
  add constraint plan_subscriptions_status_check
  check (status in ('requested', 'active', 'cancelled'));

drop policy if exists "cleanings_owner_all" on public.cleanings;
drop policy if exists "property_contacts_owner_all" on public.property_contacts;
drop policy if exists "guest_threads_owner_all" on public.guest_threads;
drop policy if exists "guest_messages_owner_read" on public.guest_messages;
drop policy if exists "learned_answers_owner_all" on public.learned_answers;
