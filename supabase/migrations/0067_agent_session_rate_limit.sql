create or replace function public.claim_agent_session_slot(
  p_principal_id text,
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
  perform pg_advisory_xact_lock(hashtext('luxel_agent_slot:' || p_principal_id));

  select count(*)
    into v_count
    from public.lux_agent_session
    where principal_id = p_principal_id
      and created_at > now() - make_interval(secs => p_window_seconds);

  return v_count < p_max;
end;
$$;

revoke all on function public.claim_agent_session_slot(text, int, int) from anon, authenticated;
grant execute on function public.claim_agent_session_slot(text, int, int) to service_role;
