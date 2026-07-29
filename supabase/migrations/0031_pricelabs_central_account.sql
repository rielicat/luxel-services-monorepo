-- Pricing runs from ONE central Luxel PriceLabs account: the host grants Luxel
-- manager access on their side, the listing then appears under Luxel's
-- credential, and Luxel drives the optimisation. Nothing per-host is stored
-- except the mapping from a Luxel property to its PriceLabs listing.
--
-- Because a single credential can see every listing across every customer, the
-- mapping is the ONLY sanctioned way to name a PriceLabs listing: server code
-- resolves it from an owner-verified property id and never from client input.
alter table public.properties add column if not exists pricelabs_pms text;
alter table public.properties add column if not exists pricelabs_synced_at timestamptz;

-- One PriceLabs listing belongs to exactly one Luxel property. Without this a
-- mis-detected match could point two customers' properties at the same remote
-- listing, letting one host move another's prices.
create unique index if not exists properties_pricelabs_listing_idx
  on public.properties (pricelabs_listing_id)
  where pricelabs_listing_id is not null;

-- Rows that reached 'connected' only because a host self-attested the old
-- handshake carry no mapping. Detection is the source of truth now, so drop
-- them back to pending or the panel shows "connected" while every write fails.
update public.properties
set pricelabs_status = 'pending_connection'
where pricelabs_status = 'connected' and pricelabs_listing_id is null;
