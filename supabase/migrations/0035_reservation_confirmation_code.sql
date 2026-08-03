-- The OTA's own confirmation code (Airbnb's HM…) is the only reservation
-- identifier that survives a change of PMS: the vendor's reservation id does
-- not, and matching stays on (property, arrival, departure) guesses whenever a
-- property has two same-day arrivals.
--
-- It has been reaching us all along and being thrown away into a display string
-- (`summary = 'Airbnb <code>'`), so this both captures it going forward and
-- recovers it for every reservation already mirrored.
alter table public.checkins add column if not exists confirmation_code text;
alter table public.calendar_blocks add column if not exists confirmation_code text;

-- Recover from the display string. Guards against the two ways that string can
-- be junk: a null code renders as the literal 'null' or 'undefined'.
update public.calendar_blocks
   set confirmation_code = nullif(trim(substring(summary from '^Airbnb\s+(.+)$')), '')
 where confirmation_code is null
   and summary ~ '^Airbnb\s+.+$'
   and trim(substring(summary from '^Airbnb\s+(.+)$')) not in ('null', 'undefined');

-- checkins and calendar_blocks carry the same reservation uid, so the code
-- recovered above carries across to the check-in rows that guests hold links to.
update public.checkins c
   set confirmation_code = b.confirmation_code
  from public.calendar_blocks b
 where c.confirmation_code is null
   and b.confirmation_code is not null
   and b.external_uid = c.reservation_uid;

-- The cutover maps old rows to new ones by this code, so it is looked up by
-- value rather than scanned.
create index if not exists checkins_confirmation_code_idx
  on public.checkins (confirmation_code)
  where confirmation_code is not null;
create index if not exists calendar_blocks_confirmation_code_idx
  on public.calendar_blocks (confirmation_code)
  where confirmation_code is not null;
