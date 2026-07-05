-- Compatibility shim: some local Postgres images (older `supabase` CLI) don't
-- pre-create auth.jwt() before user migrations run, so the RLS policies in
-- 0001_init that call auth.jwt() fail on a fresh local stack. Supabase Cloud and
-- recent CLIs already define it, so this is guarded to be a no-op there — it only
-- creates the canonical definition when the function is genuinely missing.
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
