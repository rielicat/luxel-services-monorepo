alter table public.guest_threads
  add column if not exists reservation_category text;
create index if not exists guest_threads_category_idx
  on public.guest_threads (reservation_category);
