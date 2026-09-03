alter table public.checkins add column if not exists origin text not null default 'channel';
alter table public.checkins drop constraint if exists checkins_origin_check;
alter table public.checkins
  add constraint checkins_origin_check check (origin in ('channel', 'manual'));
create index if not exists checkins_manual_idx
  on public.checkins (property_id) where origin = 'manual';

alter table public.calendar_blocks add column if not exists origin text not null default 'channel';
alter table public.calendar_blocks drop constraint if exists calendar_blocks_origin_check;
alter table public.calendar_blocks
  add constraint calendar_blocks_origin_check check (origin in ('channel', 'manual'));
create index if not exists calendar_blocks_manual_idx
  on public.calendar_blocks (property_id) where origin = 'manual';

create or replace function public.tg_manual_block_no_overlap()
returns trigger language plpgsql as $$
begin
  if new.origin <> 'manual' then
    return new;
  end if;
  if new.ends_on <= new.starts_on then
    raise exception 'manual stay needs at least one night'
      using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.calendar_blocks b
    where b.property_id = new.property_id
      and b.id <> new.id
      and daterange(b.starts_on, b.ends_on, '[)')
          && daterange(new.starts_on, new.ends_on, '[)')
  ) then
    raise exception 'manual stay overlaps a block on this property'
      using errcode = '23P01';
  end if;
  return new;
end;
$$;

drop trigger if exists calendar_blocks_manual_no_overlap on public.calendar_blocks;
create trigger calendar_blocks_manual_no_overlap
  before insert or update on public.calendar_blocks
  for each row execute function public.tg_manual_block_no_overlap();
