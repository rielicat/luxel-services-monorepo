-- Automation is the product: turnovers confirm themselves (and notify whoever
-- runs them) unless the host opts out and prefers to confirm by hand.
alter table public.properties
  add column if not exists cleaning_auto_confirm boolean not null default true;
