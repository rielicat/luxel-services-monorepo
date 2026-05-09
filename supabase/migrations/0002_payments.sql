-- 0002_payments.sql — provider session/payment ids on bookings + payment events ledger
--
-- The bookings table already has payment_provider + payment_status. We add the provider's
-- session/intent identifiers so webhooks can resolve back to the booking, and we add a
-- payment_events table as an idempotency ledger so repeated webhook deliveries don't
-- double-update bookings.

alter table public.bookings
  add column if not exists provider_session_id text,
  add column if not exists provider_payment_id text;

create index if not exists bookings_provider_session_id_idx
  on public.bookings(provider_session_id)
  where provider_session_id is not null;
create index if not exists bookings_provider_payment_id_idx
  on public.bookings(provider_payment_id)
  where provider_payment_id is not null;

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe', 'mercadopago')),
  event_id text not null,
  event_type text not null,
  booking_id uuid references public.bookings(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);

alter table public.payment_events enable row level security;
-- No public policies — service role only.
