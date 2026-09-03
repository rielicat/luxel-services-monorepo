create table public.guest_threads (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  channel text not null default 'local',
  external_thread_id text,
  guest_name text,
  status text not null default 'open' check (status in ('open', 'needs_host', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, channel, external_thread_id)
);
create index on public.guest_threads(property_id);
alter table public.guest_threads enable row level security;
create policy "guest_threads_owner_all"
  on public.guest_threads for all
  using (property_id in (
    select p.id from public.properties p join public.customers c on c.id = p.owner_id
    where c.clerk_user_id = (auth.jwt() ->> 'sub')));

create table public.guest_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.guest_threads(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  source text not null check (source in ('guest', 'ai', 'host')),
  body text not null,
  external_id text,
  created_at timestamptz not null default now()
);
create index on public.guest_messages(thread_id, created_at);
alter table public.guest_messages enable row level security;
create policy "guest_messages_owner_read"
  on public.guest_messages for select
  using (thread_id in (
    select t.id from public.guest_threads t
    join public.properties p on p.id = t.property_id
    join public.customers c on c.id = p.owner_id
    where c.clerk_user_id = (auth.jwt() ->> 'sub')));

create table public.learned_answers (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  question text not null,
  answer text not null,
  created_at timestamptz not null default now()
);
create index on public.learned_answers(property_id);
alter table public.learned_answers enable row level security;
create policy "learned_answers_owner_all"
  on public.learned_answers for all
  using (property_id in (
    select p.id from public.properties p join public.customers c on c.id = p.owner_id
    where c.clerk_user_id = (auth.jwt() ->> 'sub')));
