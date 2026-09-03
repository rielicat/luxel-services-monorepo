alter table public.properties add column if not exists pricelabs_pms text;
alter table public.properties add column if not exists pricelabs_synced_at timestamptz;

create unique index if not exists properties_pricelabs_listing_idx
  on public.properties (pricelabs_listing_id)
  where pricelabs_listing_id is not null;

update public.properties
set pricelabs_status = 'pending_connection'
where pricelabs_status = 'connected' and pricelabs_listing_id is null;
