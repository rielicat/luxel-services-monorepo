alter table public.checkins add column if not exists reminded_at timestamptz;
alter table public.checkins add column if not exists access_sent_at timestamptz;
alter table public.checkins add column if not exists reminder_claim_at timestamptz;
alter table public.checkins add column if not exists access_claim_at timestamptz;

alter table public.checkins add column if not exists revoked_at timestamptz;

create index if not exists checkins_pending_arrival_idx
  on public.checkins (arrival_date)
  where status = 'pending';

update public.checkins
   set revoked_at = now()
 where revoked_at is null
   and departure_date is null;
