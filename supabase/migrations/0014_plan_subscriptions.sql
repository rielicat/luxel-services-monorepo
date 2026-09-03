create table public.plan_subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  plan text not null check (plan in ('ai', 'ai_cleaning')),
  status text not null default 'trialing' check (status in ('trialing', 'active', 'cancelled')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  provider text,
  provider_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id)
);
alter table public.plan_subscriptions enable row level security;
create policy "plan_subscriptions_self_read"
  on public.plan_subscriptions for select
  using (customer_id in (select id from public.customers where clerk_user_id = (auth.jwt() ->> 'sub')));
