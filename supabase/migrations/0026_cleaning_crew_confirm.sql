alter table public.cleanings
  add column if not exists confirm_token uuid not null default gen_random_uuid();
alter table public.cleanings add column if not exists crew_confirmed_at timestamptz;
create unique index if not exists cleanings_confirm_token_idx
  on public.cleanings (confirm_token);

alter table public.checkins add column if not exists reservation_uid text;
alter table public.checkins add column if not exists arrival_date date;
alter table public.checkins add column if not exists departure_date date;
create unique index if not exists checkins_reservation_uid_idx
  on public.checkins (reservation_uid)
  where reservation_uid is not null;
