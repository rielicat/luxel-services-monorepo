export const PLAN_FIXED_CLP = 99_900;
export const PLAN_HYBRID_BASE_CLP = 49_900;
export const PLAN_HYBRID_PCT = 0.06;
export const PLAN_COMMISSION_PCT = 0.12;

export const PLAN_KEYS = ['fixed', 'hybrid', 'commission'] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export function isPlanKey(value: unknown): value is PlanKey {
  return (PLAN_KEYS as readonly string[]).includes(String(value));
}

export function planMonthlyCost(plan: PlanKey, revenueClp: number): number {
  const revenue = Math.max(0, revenueClp);
  if (plan === 'fixed') return PLAN_FIXED_CLP;
  if (plan === 'hybrid') return Math.round(PLAN_HYBRID_BASE_CLP + revenue * PLAN_HYBRID_PCT);
  return Math.round(revenue * PLAN_COMMISSION_PCT);
}

export function cheapestPlan(revenueClp: number): PlanKey {
  return [...PLAN_KEYS].sort(
    (a, b) => planMonthlyCost(a, revenueClp) - planMonthlyCost(b, revenueClp),
  )[0]!;
}
