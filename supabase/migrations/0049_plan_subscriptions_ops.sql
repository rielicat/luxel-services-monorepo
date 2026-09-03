drop trigger if exists plan_subscriptions_updated_at on public.plan_subscriptions;
create trigger plan_subscriptions_updated_at
  before update on public.plan_subscriptions
  for each row execute function public.tg_set_updated_at();
