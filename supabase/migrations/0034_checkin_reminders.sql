-- Delivery of access was coupled to the guest submitting the check-in form: a
-- guest who ignored the link arrived with nothing. The sync now nudges them the
-- day before and, on arrival day, points them at their access.
--
-- Claim and confirmation are deliberately SEPARATE columns. A single watermark
-- stamped before the send is unrecoverable: if the run dies between the stamp
-- and the send, the row looks delivered forever and the guest is never
-- contacted again. The claim is reclaimable after a grace period; only a
-- confirmed send sets *_at.
alter table public.checkins add column if not exists reminded_at timestamptz;
alter table public.checkins add column if not exists access_sent_at timestamptz;
alter table public.checkins add column if not exists reminder_claim_at timestamptz;
alter table public.checkins add column if not exists access_claim_at timestamptz;

-- A link revoked because its reservation was cancelled must stop revealing
-- access, even once the guest has already checked in — those rows are retained
-- for compliance rather than deleted, so retention cannot mean "still valid".
alter table public.checkins add column if not exists revoked_at timestamptz;

-- The reminder pass scans by arrival for stays still awaiting a submission.
create index if not exists checkins_pending_arrival_idx
  on public.checkins (arrival_date)
  where status = 'pending';

-- A check-in with no departure date can never expire, which would turn its link
-- into a permanent door-code viewer. Legacy rows (pre-0026) and operator debug
-- links have none, so stamp them revoked rather than leaving them open.
update public.checkins
   set revoked_at = now()
 where revoked_at is null
   and departure_date is null;
