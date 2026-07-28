-- Conversation imports are idempotent at the DB level: concurrent syncs (page
-- visits, background after() syncs, webhooks) can no longer double-import the
-- same channel message. Dedupe first (keep the earliest row), then enforce.
delete from public.guest_messages a
  using public.guest_messages b
  where a.external_id is not null
    and a.thread_id = b.thread_id
    and a.external_id = b.external_id
    and (a.created_at > b.created_at or (a.created_at = b.created_at and a.ctid > b.ctid));

-- NULL external_ids (replies written by the pipeline itself) stay unconstrained
-- (Postgres treats NULLs as distinct).
create unique index if not exists guest_messages_thread_external_key
  on public.guest_messages (thread_id, external_id);
