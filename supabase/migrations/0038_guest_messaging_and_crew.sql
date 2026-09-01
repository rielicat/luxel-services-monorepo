-- Time-based guest messages (check-in info at T-3, reminder, check-out, review)
-- now live in Hospitable's own message rules, so the daily pass and its
-- send-once columns go. What stays event-driven grows: the booking message
-- needs the guest's language, the conserje needs the registered guest list with
-- parking, and both conserjes and the cleaning crew become per-property contact
-- LISTS with a role, reached over WhatsApp.

-- ───── contacts with roles ────────────────────────────────────
alter table public.cleaning_contacts rename to property_contacts;
alter table public.property_contacts
  add column if not exists role text not null default 'cleaning';
alter table public.property_contacts
  drop constraint if exists property_contacts_role_check;
alter table public.property_contacts
  add constraint property_contacts_role_check check (role in ('cleaning', 'concierge'));
alter index if exists public.cleaning_contacts_property_idx
  rename to property_contacts_property_idx;
create index if not exists property_contacts_property_role_idx
  on public.property_contacts (property_id, role);
alter policy "cleaning_contacts_owner_all" on public.property_contacts
  rename to "property_contacts_owner_all";

-- The single concierge contact on property_access becomes a row like any other.
insert into public.property_contacts (property_id, role, name, email, whatsapp)
select pa.property_id, 'concierge', pa.concierge_name, pa.concierge_email, pa.concierge_whatsapp
  from public.property_access pa
 where (pa.concierge_whatsapp is not null or pa.concierge_email is not null)
   and not exists (
     select 1 from public.property_contacts pc
      where pc.property_id = pa.property_id and pc.role = 'concierge');
alter table public.property_access
  drop column if exists concierge_whatsapp,
  drop column if exists concierge_email;

-- ───── what the crew messages need to say ─────────────────────
-- Hospitable's listing carries the street, not the apartment number.
alter table public.property_access
  add column if not exists unit text;

-- Hospitable's listing details (wifi, guest access, additional rules), mirrored
-- for the AI's context. Never sent by us: Hospitable's own rule carries them.
alter table public.properties
  add column if not exists listing_details jsonb;

alter table public.checkins
  add column if not exists guest_language text,
  add column if not exists guest_first_name text,
  add column if not exists expected_guests int,
  add column if not exists parking boolean,
  add column if not exists vehicle_plate text,
  add column if not exists crew_notified_at timestamptz;

-- ───── the daily pass is gone ─────────────────────────────────
drop index if exists public.checkins_pending_arrival_idx;
alter table public.checkins
  drop column if exists reminded_at,
  drop column if exists access_sent_at,
  drop column if exists reminder_claim_at,
  drop column if exists access_claim_at;
