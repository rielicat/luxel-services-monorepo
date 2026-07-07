-- Atomic per-session rate limit for the public human-handoff chat endpoint
-- (/api/chat/human). Replaces a check-then-insert in the API that was a TOCTOU
-- race: concurrent requests all read count < cap before any row was written, so
-- the cap didn't bound bursts. Counting AND the reservation insert now happen
-- under one per-session advisory lock, so N concurrent calls serialize and the
-- cap holds. The reservation is the user's own message row, so a request that is
-- rejected writes nothing (bounds unauthenticated insert spam), and the count is
-- of attempts — a forward that later fails to send still consumed its slot.

create or replace function public.claim_chat_slot(
  p_session_id text,
  p_customer_id uuid,
  p_body text,
  p_max int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  -- Serialize concurrent requests for this session for the rest of the txn.
  perform pg_advisory_xact_lock(hashtext('luxel_chat_slot:' || p_session_id));

  select count(*)
    into v_count
    from public.messages
    where session_id = p_session_id
      and metadata->>'kind' = 'human'
      and created_at > now() - make_interval(secs => p_window_seconds);

  if v_count >= p_max then
    return false;
  end if;

  insert into public.messages (customer_id, session_id, direction, channel, body, metadata)
  values (p_customer_id, p_session_id, 'in', 'web', p_body, jsonb_build_object('kind', 'human'));

  return true;
end;
$$;

grant execute on function public.claim_chat_slot(text, uuid, text, int, int) to service_role;
