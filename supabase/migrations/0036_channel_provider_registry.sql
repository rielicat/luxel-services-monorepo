-- The provider check constraint is the database's copy of the plugin registry,
-- and 0018 left it listing a provider that no longer exists in the codebase.
-- Narrow it to what is actually registered, so the schema cannot claim support
-- the application does not have.
--
-- Adding a provider means widening this list — it is edit 4 of the four listed
-- at the top of apps/web/src/lib/channels/types.ts.

-- Deliberately not a data migration: no code path has ever written a value
-- other than 'hospitable' here, so a row that violates this is a real surprise
-- and must fail loudly rather than be quietly rewritten or deleted.
do $$
declare rogue text;
begin
  select string_agg(distinct provider, ', ')
    into rogue
    from channel_connections
   where provider <> 'hospitable';
  if rogue is not null then
    raise exception
      'channel_connections holds unregistered provider(s): %. Resolve these rows before narrowing the constraint.', rogue;
  end if;
end $$;

alter table channel_connections
  drop constraint if exists channel_connections_provider_check;

alter table channel_connections
  add constraint channel_connections_provider_check
  check (provider in ('hospitable'));
