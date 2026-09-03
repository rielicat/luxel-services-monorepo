alter table public.checkins add column if not exists confirmation_code text;
alter table public.calendar_blocks add column if not exists confirmation_code text;

update public.calendar_blocks
   set confirmation_code = nullif(trim(substring(summary from '^Airbnb\s+(.+)$')), '')
 where confirmation_code is null
   and summary ~ '^Airbnb\s+.+$'
   and trim(substring(summary from '^Airbnb\s+(.+)$')) not in ('null', 'undefined');

update public.checkins c
   set confirmation_code = b.confirmation_code
  from public.calendar_blocks b
 where c.confirmation_code is null
   and b.confirmation_code is not null
   and b.external_uid = c.reservation_uid;

create index if not exists checkins_confirmation_code_idx
  on public.checkins (confirmation_code)
  where confirmation_code is not null;
create index if not exists calendar_blocks_confirmation_code_idx
  on public.calendar_blocks (confirmation_code)
  where confirmation_code is not null;
