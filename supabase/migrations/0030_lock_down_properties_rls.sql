-- Same lockdown as 0008 (bookings/addresses), now that `properties` carries
-- paywalled state: price_optimization_enabled gates a paid add-on and
-- pricelabs_status is operator/host-attested. `properties_owner_all` was FOR
-- ALL, so a host could PATCH /rest/v1/properties with their own Clerk JWT and
-- flip both — bypassing the add-on gate entirely. Every legitimate write goes
-- through the service-role client (which bypasses RLS), so hosts need SELECT
-- only.
drop policy if exists "properties_owner_all" on public.properties;
drop policy if exists "properties_owner_read" on public.properties;
create policy "properties_owner_read"
  on public.properties for select
  using (owner_id in (
    select c.id from public.customers c where c.clerk_user_id = (auth.jwt() ->> 'sub')));
