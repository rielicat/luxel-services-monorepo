alter table public.properties add column if not exists guest_context jsonb;

update public.properties
set guest_context = jsonb_build_object('notes', btrim(guest_info))
where guest_context is null
  and guest_info is not null
  and btrim(guest_info) <> '';
