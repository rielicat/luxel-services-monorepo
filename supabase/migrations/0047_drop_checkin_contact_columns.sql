alter table public.checkins
  drop column if exists guest_email,
  drop column if exists guest_phone;

alter table public.checkin_guests drop column if exists nationality;
