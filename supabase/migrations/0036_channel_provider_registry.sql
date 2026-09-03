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
