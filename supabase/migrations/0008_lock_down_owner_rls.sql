drop policy if exists "bookings_owner_all" on public.bookings;
create policy "bookings_owner_read"
  on public.bookings for select
  using (
    customer_id in (
      select id from public.customers where clerk_user_id = (auth.jwt() ->> 'sub')
    )
  );

drop policy if exists "addresses_owner_all" on public.addresses;
create policy "addresses_owner_read"
  on public.addresses for select
  using (
    customer_id in (
      select id from public.customers where clerk_user_id = (auth.jwt() ->> 'sub')
    )
  );
