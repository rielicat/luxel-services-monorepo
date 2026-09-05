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
