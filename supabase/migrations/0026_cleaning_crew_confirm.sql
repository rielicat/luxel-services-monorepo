-- Crew-side attendance confirmation: the notification carries a tokenized link
-- and whoever runs the turnover confirms from their phone — the host only
-- watches the status.
alter table public.cleanings
  add column if not exists confirm_token uuid not null default gen_random_uuid();
alter table public.cleanings add column if not exists crew_confirmed_at timestamptz;
create unique index if not exists cleanings_confirm_token_idx
  on public.cleanings (confirm_token);

-- Check-in links are sent to the guest automatically when a reservation is
-- imported; the reservation uid is the send-once anchor, and the stay dates
-- bound the token's useful life (submit is rejected after departure).
alter table public.checkins add column if not exists reservation_uid text;
alter table public.checkins add column if not exists arrival_date date;
alter table public.checkins add column if not exists departure_date date;
create unique index if not exists checkins_reservation_uid_idx
  on public.checkins (reservation_uid)
  where reservation_uid is not null;
