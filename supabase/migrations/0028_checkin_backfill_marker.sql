-- Adopting automatic check-in links must never message guests who booked
-- before the feature existed: the first sync that sees a property seeds
-- anchors for its current reservations silently and stamps this marker.
-- Only reservations imported AFTER the stamp get a message.
alter table public.properties
  add column if not exists checkin_links_backfilled_at timestamptz;
