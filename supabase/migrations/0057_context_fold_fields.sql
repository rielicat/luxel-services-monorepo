update public.properties
set guest_context = (guest_context - 'lift' - 'supplies' - 'transport')
  || jsonb_build_object(
       'notes',
       btrim(
         concat_ws(
           ' ',
           nullif(btrim(coalesce(guest_context ->> 'notes', '')), ''),
           nullif(btrim(coalesce(guest_context ->> 'lift', '')), ''),
           nullif(btrim(coalesce(guest_context ->> 'supplies', '')), ''),
           nullif(btrim(coalesce(guest_context ->> 'transport', '')), '')
         )
       )
     )
where guest_context ?| array['lift', 'supplies', 'transport'];

update public.properties
set guest_context = guest_context - 'notes'
where guest_context is not null
  and btrim(coalesce(guest_context ->> 'notes', '')) = '';

update public.properties
set guest_context = null
where guest_context is not null and guest_context = '{}'::jsonb;
