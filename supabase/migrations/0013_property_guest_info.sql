-- Free-form property knowledge the AI co-pilot grounds its guest replies on
-- (wifi, house rules, check-in, amenities, nearby). No PMS/partner API needed:
-- the co-pilot drafts, the host sends.
alter table public.properties add column guest_info text;
