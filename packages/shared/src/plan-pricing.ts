export const PLAN_COMMISSION_PCT = 0.12;

export const PLAN_KEYS = ['commission'] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export function isPlanKey(value: unknown): value is PlanKey {
  return (PLAN_KEYS as readonly string[]).includes(String(value));
}

export function planMonthlyCost(revenueClp: number): number {
  return Math.round(Math.max(0, revenueClp) * PLAN_COMMISSION_PCT);
}
