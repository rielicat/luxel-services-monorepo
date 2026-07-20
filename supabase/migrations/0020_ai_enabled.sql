-- The host's simple on/off for automatic AI guest replies. Off → every inbound
-- goes straight to the host inbox (needs_host); nothing is auto-sent.
alter table public.properties add column ai_enabled boolean not null default true;
