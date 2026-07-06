-- 0008_lock_down_owner_rls.sql — remove customer WRITE access to bookings/addresses
--
-- bookings_owner_all / addresses_owner_all granted customers full write (FOR ALL)
-- via the public anon key + their Clerk JWT. Every legitimate write to these
-- tables goes through the service-role client (which bypasses RLS), so a signed-in
-- customer needs read-only access at most. Left as-is, a customer could PATCH their
-- own booking directly — e.g. set payment_status='paid' (free service) or lower
-- total_price_clp before checkout. Restrict both policies to SELECT.

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
