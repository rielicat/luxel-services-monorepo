alter table public.guest_threads
  add column if not exists agent_busy_until timestamptz;

create index if not exists guest_threads_agent_busy_idx
  on public.guest_threads (agent_busy_until)
  where agent_busy_until is not null;
