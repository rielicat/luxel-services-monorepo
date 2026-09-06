alter table public.cleaning_walkthrough drop column if exists recorded_by_crew_member_id;
alter table public.cleaning_inventory drop column if exists confirmed_by_crew_member_id;

drop table if exists public.crew_assignment;
drop table if exists public.crew_member;

notify pgrst, 'reload schema';
