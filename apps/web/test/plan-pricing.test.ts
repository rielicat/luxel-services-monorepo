import { describe, it, expect } from 'vitest';
import {
  FIXED_BEATS_HYBRID_CLP,
  HYBRID_BEATS_COMMISSION_CLP,
  PLAN_FIXED_CLP,
  PLAN_KEYS,
  cheapestPlan,
  isPlanKey,
  planMonthlyCost,
} from '@luxel/shared/plan-pricing';
import { runTool } from '../src/lib/ai/tools';

describe('plan pricing', () => {
  it('prices each plan from the monthly booking revenue', () => {
    expect(planMonthlyCost('commission', 1_750_000)).toBe(210_000);
    expect(planMonthlyCost('hybrid', 1_750_000)).toBe(154_900);
    expect(planMonthlyCost('fixed', 1_750_000)).toBe(189_900);
    expect(planMonthlyCost('fixed', 0)).toBe(PLAN_FIXED_CLP);
    expect(planMonthlyCost('commission', 0)).toBe(0);
  });

  it('never bills a negative revenue', () => {
    for (const plan of PLAN_KEYS) {
      expect(planMonthlyCost(plan, -500_000)).toBe(planMonthlyCost(plan, 0));
    }
  });

  it('gives every plan a band where it is the cheapest', () => {
    expect(HYBRID_BEATS_COMMISSION_CLP).toBeLessThan(FIXED_BEATS_HYBRID_CLP);
    expect(cheapestPlan(HYBRID_BEATS_COMMISSION_CLP - 100_000)).toBe('commission');
    expect(cheapestPlan(HYBRID_BEATS_COMMISSION_CLP + 100_000)).toBe('hybrid');
    expect(cheapestPlan(FIXED_BEATS_HYBRID_CLP - 100_000)).toBe('hybrid');
    expect(cheapestPlan(FIXED_BEATS_HYBRID_CLP + 100_000)).toBe('fixed');
  });

  it('levels the plans at each break-even', () => {
    expect(planMonthlyCost('commission', HYBRID_BEATS_COMMISSION_CLP)).toBe(
      planMonthlyCost('hybrid', HYBRID_BEATS_COMMISSION_CLP),
    );
    expect(planMonthlyCost('hybrid', FIXED_BEATS_HYBRID_CLP)).toBe(
      planMonthlyCost('fixed', FIXED_BEATS_HYBRID_CLP),
    );
  });

  it('accepts only the three plan keys', () => {
    expect(PLAN_KEYS).toEqual(['commission', 'hybrid', 'fixed']);
    expect(isPlanKey('hybrid')).toBe(true);
    expect(isPlanKey('ai')).toBe(false);
    expect(isPlanKey(undefined)).toBe(false);
  });
});

describe('get_airbnb_quote', () => {
  const quote = (input: Record<string, unknown>) => runTool('get_airbnb_quote', input, {});

  it('never prices a revenue plan on an unknown revenue', async () => {
    for (const plan of ['commission', 'hybrid'] as const) {
      const r = await quote({ listings: 1, plan });
      expect(r.widget).toBeUndefined();
      expect(r.content).toContain('ingreso mensual');
    }
  });

  it('quotes the flat plan without a revenue, and every plan with one', async () => {
    const flat = await quote({ listings: 2, plan: 'fixed' });
    expect(flat.widget).toMatchObject({ plan: 'fixed', monthlyClp: 379_800 });

    const share = await quote({ listings: 1, plan: 'commission', monthly_revenue_clp: 1_750_000 });
    expect(share.widget).toMatchObject({ plan: 'commission', monthlyClp: 210_000 });
  });

  it('picks the cheapest plan when the visitor names none', async () => {
    const low = await quote({ listings: 1, monthly_revenue_clp: 600_000 });
    expect(low.widget).toMatchObject({ plan: 'commission' });

    const mid = await quote({ listings: 1, monthly_revenue_clp: 1_750_000 });
    expect(mid.widget).toMatchObject({ plan: 'hybrid' });

    const high = await quote({ listings: 1, monthly_revenue_clp: 3_000_000 });
    expect(high.widget).toMatchObject({ plan: 'fixed' });
  });
});
