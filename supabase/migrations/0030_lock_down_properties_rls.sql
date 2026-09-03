drop policy if exists "properties_owner_all" on public.properties;
drop policy if exists "properties_owner_read" on public.properties;
create policy "properties_owner_read"
  on public.properties for select
  using (owner_id in (
    select c.id from public.customers c where c.clerk_user_id = (auth.jwt() ->> 'sub')));
