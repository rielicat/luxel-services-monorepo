/**
 * Client-safe plan pricing constants. Kept out of `plans.ts` (which is
 * `server-only`) so both server pages and client components (the AirBnB quote)
 * can read a single source of truth for the flat management fee.
 */
/** Base tier: full AI automation, flat fee per listing. */
export const AI_PLAN_CLP = 39900;
/** Premium tier: AI + human-handoff fallback (a real team takes over when the
 *  AI defers) — agency-grade backstop at a flat fee per listing. */
export const AI_PLAN_HANDOFF_CLP = 99900;
export const TRIAL_DAYS = 14;

export type AirbnbTier = 'base' | 'handoff';

export function airbnbTierPrice(tier: AirbnbTier): number {
  return tier === 'handoff' ? AI_PLAN_HANDOFF_CLP : AI_PLAN_CLP;
}
