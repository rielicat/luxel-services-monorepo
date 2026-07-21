/**
 * Client-safe plan pricing constants. Kept out of `plans.ts` (which is
 * `server-only`) so both server pages and client components (the AirBnB quote)
 * can read a single source of truth for the flat management fee.
 */
export const AI_PLAN_CLP = 39900;
export const TRIAL_DAYS = 14;
