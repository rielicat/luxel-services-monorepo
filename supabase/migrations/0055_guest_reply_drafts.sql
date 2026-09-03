alter table public.properties
  add column if not exists ai_review boolean not null default true;

create table public.guest_reply_drafts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.guest_threads(id) on delete cascade,
  inbound_message_id uuid references public.guest_messages(id) on delete set null,
  guest_message text not null,
  body text not null default '',
  status text not null default 'pending' check (status in ('pending', 'sent', 'discarded')),
  handoff boolean not null default false,
  model text,
  origin text not null default 'inbound' check (origin in ('inbound', 'simulation')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text,
  sent_message_id uuid references public.guest_messages(id) on delete set null
);
create index on public.guest_reply_drafts(thread_id, created_at desc);
create index on public.guest_reply_drafts(status, created_at desc);
create unique index guest_reply_drafts_one_pending_idx
  on public.guest_reply_drafts(thread_id)
  where status = 'pending';

alter table public.guest_reply_drafts enable row level security;
