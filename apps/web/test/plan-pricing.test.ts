import { describe, it, expect } from 'vitest';
import {
  PLAN_COMMISSION_PCT,
  PLAN_KEYS,
  isPlanKey,
  planMonthlyCost,
} from '@luxel/shared/plan-pricing';
import { runTool } from '../src/lib/ai/tools';

describe('plan pricing', () => {
  it('charges 12% of the monthly booking revenue', () => {
    expect(PLAN_COMMISSION_PCT).toBe(0.12);
    expect(planMonthlyCost(1_750_000)).toBe(210_000);
    expect(planMonthlyCost(600_000)).toBe(72_000);
    expect(planMonthlyCost(0)).toBe(0);
  });

  it('never bills a negative revenue', () => {
    expect(planMonthlyCost(-500_000)).toBe(0);
    expect(planMonthlyCost(-1)).toBe(0);
  });

  it('rounds the fee to whole pesos', () => {
    expect(planMonthlyCost(1_234_567)).toBe(148_148);
    expect(planMonthlyCost(999_999)).toBe(120_000);
    expect(Number.isInteger(planMonthlyCost(333_333))).toBe(true);
  });

  it('accepts only the commission plan key', () => {
    expect(PLAN_KEYS).toEqual(['commission']);
    expect(isPlanKey('commission')).toBe(true);
    expect(isPlanKey('fixed')).toBe(false);
    expect(isPlanKey('hybrid')).toBe(false);
    expect(isPlanKey(undefined)).toBe(false);
  });
});

describe('get_airbnb_quote', () => {
  const quote = (input: Record<string, unknown>) => runTool('get_airbnb_quote', input, {});

  it('never quotes an amount on an unknown revenue', async () => {
    const r = await quote({ listings: 1 });
    expect(r.widget).toBeUndefined();
    expect(r.content).toContain('ingreso mensual');
  });

  it('asks again when the revenue is not a usable number', async () => {
    for (const monthly_revenue_clp of [0, -1, 'mucho', null]) {
      const r = await quote({ listings: 1, monthly_revenue_clp });
      expect(r.widget).toBeUndefined();
    }
  });

  it('quotes 12% of the revenue for every listing', async () => {
    const one = await quote({ listings: 1, monthly_revenue_clp: 1_750_000 });
    expect(one.widget).toMatchObject({ listings: 1, monthlyClp: 210_000 });
    expect(one.content).toContain('$210.000');

    const two = await quote({ listings: 2, monthly_revenue_clp: 1_750_000 });
    expect(two.widget).toMatchObject({ listings: 2, monthlyClp: 420_000 });
  });

  it('names the single plan and clamps the listing count', async () => {
    const r = await quote({ listings: 99, monthly_revenue_clp: 600_000 });
    expect(r.widget).toMatchObject({
      kind: 'airbnb_quote',
      planLabel: 'Plan Luxel',
      listings: 50,
      revenueClp: 600_000,
      monthlyClp: 3_600_000,
    });
    expect(r.content).toContain('12%');
  });

  it('ignores a plan argument, since only one plan exists', async () => {
    const withPlan = await quote({ listings: 1, plan: 'fixed', monthly_revenue_clp: 600_000 });
    const without = await quote({ listings: 1, monthly_revenue_clp: 600_000 });
    expect(withPlan.widget).toEqual(without.widget);
    expect(withPlan.content).toBe(without.content);
    expect(withPlan.content).not.toContain('Fijo');
  });
});
