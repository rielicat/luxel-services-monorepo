create table if not exists public.listing_assignments (
  external_listing_id text primary key,
  customer_id uuid not null references public.customers(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by text
);
create index if not exists listing_assignments_customer_idx
  on public.listing_assignments (customer_id);

alter table public.listing_assignments enable row level security;
drop policy if exists "listing_assignments_owner_read" on public.listing_assignments;
create policy "listing_assignments_owner_read"
  on public.listing_assignments for select
  using (customer_id in (
    select c.id from public.customers c where c.clerk_user_id = (auth.jwt() ->> 'sub')));

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

insert into public.listing_assignments (external_listing_id, customer_id, assigned_by)
select p.external_listing_id, p.owner_id, 'backfill_0032'
from public.properties p
where p.external_listing_id is not null
on conflict (external_listing_id) do nothing;
