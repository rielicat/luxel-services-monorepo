do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'jwt'
  ) then
    create schema if not exists auth;
    execute $fn$
      create function auth.jwt()
      returns jsonb
      language sql stable
      as $body$
        select coalesce(
          nullif(current_setting('request.jwt.claim', true), ''),
          nullif(current_setting('request.jwt.claims', true), '')
        )::jsonb;
      $body$;
    $fn$;
  end if;
end
$$;
