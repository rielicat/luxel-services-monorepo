-- Inbound conversation sync from Hospitable: a watermark per connection so the
-- first sync imports history WITHOUT auto-replying to old messages, and later
-- syncs only run the AI on genuinely new guest messages. Dedupe by the
-- provider's message id.
alter table public.channel_connections add column messages_synced_at timestamptz;
create index on public.guest_messages(external_id);
