export const AI_PLAN_CLP = 39900;
export const AI_PLAN_HANDOFF_CLP = 99900;
export const TRIAL_DAYS = 14;

export type AirbnbTier = 'base' | 'handoff';

export function airbnbTierPrice(tier: AirbnbTier): number {
  return tier === 'handoff' ? AI_PLAN_HANDOFF_CLP : AI_PLAN_CLP;
}
