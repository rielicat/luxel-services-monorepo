-- Central-account tenancy.
--
-- Luxel now manages hosts from ONE Hospitable account: a host grants Luxel
-- manager access, and Luxel's single credential can then see EVERY managed
-- listing. That breaks the old assumption baked into the mirror — that whatever
-- the token returns belongs to whoever triggered the sync. Under a central
-- credential that assumption would import every customer's listings into the
-- first host who loaded the page.
--
-- This table is the authority instead: a listing belongs to exactly one
-- customer, and the mirror may only ever import/prune listings assigned to the
-- customer being synced. An unassigned listing belongs to nobody and is invisible
-- to hosts until an operator assigns it.
create table if not exists public.listing_assignments (
  external_listing_id text primary key,
  customer_id uuid not null references public.customers(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by text
);
create index if not exists listing_assignments_customer_idx
  on public.listing_assignments (customer_id);

alter table public.listing_assignments enable row level security;
-- Read-only for hosts (same lockdown as 0008/0029): this table decides which
-- listings a customer can see, so only the service-role client may write it.
drop policy if exists "listing_assignments_owner_read" on public.listing_assignments;
create policy "listing_assignments_owner_read"
  on public.listing_assignments for select
  using (customer_id in (
    select c.id from public.customers c where c.clerk_user_id = (auth.jwt() ->> 'sub')));

-- Refuse to guess: if the same listing was mirrored under two owners (an
-- operator bootstrap plus the real host, say), SQL cannot tell which is real and
-- a wrong choice is unrecoverable. Fail loudly so the duplicate is resolved by
-- hand before the assignment table becomes the authority.
do $$
declare dupe text;
begin
  select external_listing_id into dupe
  from public.properties
  where external_listing_id is not null
  group by external_listing_id
  having count(distinct owner_id) > 1
  limit 1;
  if dupe is not null then
    raise exception
      'listing % is mirrored under more than one owner; resolve the duplicate in public.properties before applying 0032', dupe;
  end if;
end $$;

-- Backfill from the pre-central world, where each host synced with their own
-- token and every imported row was already correctly attributed.
insert into public.listing_assignments (external_listing_id, customer_id, assigned_by)
select p.external_listing_id, p.owner_id, 'backfill_0032'
from public.properties p
where p.external_listing_id is not null
on conflict (external_listing_id) do nothing;
