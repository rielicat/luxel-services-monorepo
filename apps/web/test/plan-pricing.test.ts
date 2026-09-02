import { describe, it, expect } from 'vitest';
import {
  PLAN_COMMISSION_PCT,
  PLAN_FIXED_CLP,
  PLAN_HYBRID_BASE_CLP,
  PLAN_HYBRID_PCT,
  PLAN_KEYS,
  cheapestPlan,
  isPlanKey,
  planMonthlyCost,
} from '../src/lib/plan-pricing';
import { runTool } from '../src/lib/ai/tools';

const FIXED_VS_COMMISSION = PLAN_FIXED_CLP / PLAN_COMMISSION_PCT;
const HYBRID_VS_COMMISSION = PLAN_HYBRID_BASE_CLP / (PLAN_COMMISSION_PCT - PLAN_HYBRID_PCT);

describe('plan pricing', () => {
  it('charges the flat fee whatever the revenue, and the share only on revenue', () => {
    expect(planMonthlyCost('fixed', 0)).toBe(99_900);
    expect(planMonthlyCost('fixed', 3_000_000)).toBe(99_900);
    expect(planMonthlyCost('hybrid', 0)).toBe(49_900);
    expect(planMonthlyCost('hybrid', 800_000)).toBe(97_900);
    expect(planMonthlyCost('commission', 0)).toBe(0);
    expect(planMonthlyCost('commission', 800_000)).toBe(96_000);
  });

  it('never bills a negative revenue', () => {
    for (const plan of PLAN_KEYS) {
      expect(planMonthlyCost(plan, -500_000)).toBe(planMonthlyCost(plan, 0));
    }
  });

  it('puts the fixed plan ahead only above its break-even', () => {
    expect(cheapestPlan(FIXED_VS_COMMISSION - 50_000)).toBe('commission');
    expect(cheapestPlan(FIXED_VS_COMMISSION + 50_000)).toBe('fixed');
    expect(planMonthlyCost('commission', FIXED_VS_COMMISSION)).toBe(PLAN_FIXED_CLP);
  });

  it('leaves the hybrid plan cheapest only inside a band under 2.000 pesos wide', () => {
    const low = HYBRID_VS_COMMISSION;
    const high = (PLAN_FIXED_CLP - PLAN_HYBRID_BASE_CLP) / PLAN_HYBRID_PCT;
    const middle = Math.round((low + high) / 2);
    expect(high - low).toBeLessThan(2_000);
    expect(cheapestPlan(middle)).toBe('hybrid');
    expect(cheapestPlan(Math.floor(low) - 5_000)).toBe('commission');
    expect(cheapestPlan(Math.ceil(high) + 5_000)).toBe('fixed');
  });

  it('accepts only the three plan keys', () => {
    expect(PLAN_KEYS).toEqual(['fixed', 'hybrid', 'commission']);
    expect(isPlanKey('fixed')).toBe(true);
    expect(isPlanKey('ai')).toBe(false);
    expect(isPlanKey(undefined)).toBe(false);
  });
});

describe('get_airbnb_quote', () => {
  const quote = (input: Record<string, unknown>) => runTool('get_airbnb_quote', input, {});

  it('never shows an amount built on an unknown revenue', async () => {
    for (const plan of ['hybrid', 'commission'] as const) {
      const r = await quote({ listings: 1, plan });
      expect(r.widget).toBeUndefined();
      expect(r.content).toContain('ingreso mensual');
    }
  });

  it('quotes the fixed plan without a revenue, and every plan with one', async () => {
    const flat = await quote({ listings: 2, plan: 'fixed' });
    expect(flat.widget).toMatchObject({ kind: 'airbnb_quote', monthlyClp: 199_800 });

    const share = await quote({ listings: 1, plan: 'commission', monthly_revenue_clp: 800_000 });
    expect(share.widget).toMatchObject({ plan: 'commission', monthlyClp: 96_000 });
  });
});
