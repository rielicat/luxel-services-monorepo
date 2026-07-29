-- Centrally-managed customers hold no token of their own, but the sync still
-- needs somewhere to keep their watermarks: `messages_synced_at` gates AI
-- auto-replies (null = first sync, import history silently) and drives the
-- staleness clock. Without a row, a central customer's full sync re-ran on every
-- page load and their guests never got an AI reply.
--
-- `token_enc` becomes nullable so a bookkeeping row can exist without a secret.
-- Token resolution already bails on a missing token (`if (!data?.token_enc)`),
-- so such a row can never be mistaken for the customer's own connection.
alter table public.channel_connections alter column token_enc drop not null;
