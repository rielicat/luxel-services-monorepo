alter table public.channel_connections add column messages_synced_at timestamptz;
create index on public.guest_messages(external_id);
