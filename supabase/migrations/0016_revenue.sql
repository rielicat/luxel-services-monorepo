-- Phase 3: revenue optimization. A base nightly rate feeds the pricing heuristic
-- (weekend/last-minute/occupancy adjustments) and the underbooked-date detector.
alter table public.properties add column base_nightly_clp integer;
