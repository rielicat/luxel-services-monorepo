alter table public.guest_threads
  add column if not exists agent_session_id text;

create index if not exists guest_threads_agent_session_idx
  on public.guest_threads (agent_session_id)
  where agent_session_id is not null;
