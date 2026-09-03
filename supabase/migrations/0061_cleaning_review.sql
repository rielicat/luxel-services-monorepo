create table if not exists public.cleaning_review (
  id uuid primary key default gen_random_uuid(),
  cleaning_id uuid not null unique references public.cleanings(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  walkthrough_id uuid references public.cleaning_walkthrough(id) on delete set null,
  baseline_cleaning_id uuid references public.cleanings(id) on delete set null,
  status text not null default 'queued',
  reason text,
  findings jsonb not null default '[]'::jsonb,
  attempts integer not null default 0,
  model text,
  workflow_instance_id text,
  claimed_at timestamptz,
  notified_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cleaning_review
  drop constraint if exists cleaning_review_status_check;
alter table public.cleaning_review
  add constraint cleaning_review_status_check
  check (status in ('queued', 'running', 'done', 'skipped', 'failed'));

alter table public.cleaning_review
  drop constraint if exists cleaning_review_reason_check;
alter table public.cleaning_review
  add constraint cleaning_review_reason_check
  check (
    reason is null
    or reason in (
      'no_baseline',
      'no_inventory',
      'no_video',
      'video_unreadable',
      'model_unavailable',
      'model_failed',
      'attempts_exhausted'
    )
  );

alter table public.cleaning_review
  drop constraint if exists cleaning_review_findings_check;
alter table public.cleaning_review
  add constraint cleaning_review_findings_check
  check (jsonb_typeof(findings) = 'array');

alter table public.cleaning_review
  drop constraint if exists cleaning_review_attempts_check;
alter table public.cleaning_review
  add constraint cleaning_review_attempts_check
  check (attempts >= 0);

create index if not exists cleaning_review_pending_idx
  on public.cleaning_review (status, created_at)
  where status in ('queued', 'running');
create index if not exists cleaning_review_property_idx
  on public.cleaning_review (property_id, created_at desc);

alter table public.cleaning_review enable row level security;

drop trigger if exists cleaning_review_updated_at on public.cleaning_review;
create trigger cleaning_review_updated_at
  before update on public.cleaning_review
  for each row execute function public.tg_set_updated_at();
