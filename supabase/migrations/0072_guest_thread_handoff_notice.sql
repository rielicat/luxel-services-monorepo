alter table public.guest_threads
  add column if not exists handoff_notified_at timestamptz;

create index if not exists guest_threads_status_updated_idx
  on public.guest_threads(status, updated_at desc);
