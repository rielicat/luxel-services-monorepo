create extension if not exists "pgcrypto";

create table public.operation_points (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  lat numeric(9, 6) not null,
  lng numeric(9, 6) not null,
  service_radius_km numeric(6, 2) not null default 15,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.operation_points enable row level security;
create policy "operation_points_public_read"
  on public.operation_points for select
  using (active = true);

create table public.operators (
  id uuid primary key default gen_random_uuid(),
  operation_point_id uuid not null references public.operation_points(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.operators(operation_point_id);
alter table public.operators enable row level security;

create table public.service_types (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_key text not null,
  description_key text not null,
  base_rate_clp integer not null check (base_rate_clp >= 0),
  per_m2_rate_clp integer not null check (per_m2_rate_clp >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.service_types enable row level security;
create policy "service_types_public_read"
  on public.service_types for select
  using (active = true);

create table public.pricing_config (
  id text primary key,
  value_int integer,
  value_text text,
  description text,
  updated_at timestamptz not null default now()
);
alter table public.pricing_config enable row level security;
create policy "pricing_config_public_read"
  on public.pricing_config for select
  using (true);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique not null,
  email text not null,
  full_name text,
  phone text,
  preferred_locale text not null default 'es',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.customers(clerk_user_id);
alter table public.customers enable row level security;
create policy "customers_self_read"
  on public.customers for select
  using (clerk_user_id = (auth.jwt() ->> 'sub'));
create policy "customers_self_update"
  on public.customers for update
  using (clerk_user_id = (auth.jwt() ->> 'sub'));

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  label text,
  line text not null,
  commune text,
  region text not null default 'Región Metropolitana',
  lat numeric(9, 6),
  lng numeric(9, 6),
  created_at timestamptz not null default now()
);
create index on public.addresses(customer_id);
alter table public.addresses enable row level security;
create policy "addresses_owner_all"
  on public.addresses for all
  using (
    customer_id in (
      select id from public.customers where clerk_user_id = (auth.jwt() ->> 'sub')
    )
  )
  with check (
    customer_id in (
      select id from public.customers where clerk_user_id = (auth.jwt() ->> 'sub')
    )
  );

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  service_type_id uuid not null references public.service_types(id),
  address_id uuid not null references public.addresses(id),
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  preferred_timeblock text check (preferred_timeblock in ('manana', 'tarde')),
  preferred_dow integer check (preferred_dow between 0 and 6),
  square_meters integer not null check (square_meters > 0),
  tools_provided_by text not null check (tools_provided_by in ('customer', 'company')),
  amount_per_visit_clp integer not null check (amount_per_visit_clp >= 0),
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  payment_provider text not null check (payment_provider in ('stripe', 'mercadopago')),
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.subscriptions(customer_id);
create index on public.subscriptions(provider_subscription_id);
alter table public.subscriptions enable row level security;
create policy "subscriptions_owner_read"
  on public.subscriptions for select
  using (
    customer_id in (
      select id from public.customers where clerk_user_id = (auth.jwt() ->> 'sub')
    )
  );

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  address_id uuid not null references public.addresses(id),
  service_type_id uuid not null references public.service_types(id),
  operation_point_id uuid not null references public.operation_points(id),
  operator_id uuid references public.operators(id),
  subscription_id uuid references public.subscriptions(id),
  scheduled_date date not null,
  timeblock text not null check (timeblock in ('manana', 'tarde')),
  square_meters integer not null check (square_meters > 0),
  tools_provided_by text not null check (tools_provided_by in ('customer', 'company')),
  total_price_clp integer not null check (total_price_clp >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  payment_provider text check (payment_provider in ('stripe', 'mercadopago')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'refunded')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.bookings(customer_id);
create index on public.bookings(scheduled_date, timeblock);
create index on public.bookings(operation_point_id, scheduled_date, timeblock);
alter table public.bookings enable row level security;
create policy "bookings_owner_all"
  on public.bookings for all
  using (
    customer_id in (
      select id from public.customers where clerk_user_id = (auth.jwt() ->> 'sub')
    )
  )
  with check (
    customer_id in (
      select id from public.customers where clerk_user_id = (auth.jwt() ->> 'sub')
    )
  );

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  session_id text,
  direction text not null check (direction in ('in', 'out')),
  channel text not null check (channel in ('web', 'whatsapp')),
  body text not null,
  whatsapp_message_id text unique,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index on public.messages(customer_id, created_at desc);
create index on public.messages(session_id, created_at desc);
alter table public.messages enable row level security;
create policy "messages_owner_read"
  on public.messages for select
  using (
    customer_id in (
      select id from public.customers where clerk_user_id = (auth.jwt() ->> 'sub')
    )
  );
create policy "messages_owner_insert"
  on public.messages for insert
  with check (
    customer_id in (
      select id from public.customers where clerk_user_id = (auth.jwt() ->> 'sub')
    )
  );

create table public.faq_entries (
  id uuid primary key default gen_random_uuid(),
  question_key text not null,
  answer_key text not null,
  keywords text[] not null,
  priority integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.faq_entries enable row level security;
create policy "faq_entries_public_read"
  on public.faq_entries for select
  using (active = true);

create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger customers_updated_at
  before update on public.customers
  for each row execute function public.tg_set_updated_at();
create trigger bookings_updated_at
  before update on public.bookings
  for each row execute function public.tg_set_updated_at();
create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.tg_set_updated_at();
