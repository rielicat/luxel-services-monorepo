import { describe, it, expect } from 'vitest';
import {
  PLAN_COMMISSION_PCT,
  PLAN_KEYS,
  isPlanKey,
  planMonthlyCost,
} from '@luxel/shared/plan-pricing';
import { runTool } from '../src/lib/ai/tools';
import {
  MIN_COMPARABLE_LISTINGS,
  summarizeComparables,
  type ComparableStay,
} from '../src/lib/ai/pricing-reference';

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
    expect(r.content).toContain('get_pricing_reference');
    expect(r.content).toContain('no repitas la pregunta');
  });

  it('asks again when the revenue is not a usable number', async () => {
    for (const monthly_revenue_clp of [0, -1, 'mucho', null]) {
      const r = await quote({ listings: 1, monthly_revenue_clp });
      expect(r.widget).toBeUndefined();
    }
  });

  it('leads with what the host keeps, not with the Luxel fee', async () => {
    const r = await quote({ listings: 1, monthly_revenue_clp: 1_750_000 });
    expect(r.widget).toMatchObject({
      kind: 'airbnb_quote',
      listings: 1,
      revenueClp: 1_750_000,
      keptClp: 1_540_000,
      monthlyClp: 210_000,
      keptMaxClp: null,
      monthlyMaxClp: null,
      revenueMaxClp: null,
      commissionPct: 0.12,
    });
    expect(r.content).toContain('$1.540.000');
    expect(r.content.indexOf('le quedan')).toBeLessThan(r.content.indexOf('comisión Luxel'));
  });

  it('keeps the arithmetic honest across several listings', async () => {
    const r = await quote({ listings: 3, monthly_revenue_clp: 1_000_000 });
    const w = r.widget as { keptClp: number; monthlyClp: number; listings: number };
    expect(w.listings).toBe(3);
    expect(w.monthlyClp).toBe(360_000);
    expect(w.keptClp).toBe(2_640_000);
    expect(w.keptClp + w.monthlyClp).toBe(3_000_000);
  });

  it('says the guest cleaning fee stays with the crew and pays no commission', async () => {
    const r = await quote({ listings: 1, monthly_revenue_clp: 600_000 });
    expect(r.content).toContain('tarifa de limpieza');
    expect(r.content).toContain('equipo de aseo');
    expect(r.content).toContain('no paga comisión');
  });

  it('renders ONE widget for a revenue range', async () => {
    const r = await quote({
      listings: 1,
      monthly_revenue_clp: 900_000,
      monthly_revenue_max_clp: 1_100_000,
    });
    expect(r.widget).toMatchObject({
      kind: 'airbnb_quote',
      revenueClp: 900_000,
      revenueMaxClp: 1_100_000,
      keptClp: 792_000,
      keptMaxClp: 968_000,
      monthlyClp: 108_000,
      monthlyMaxClp: 132_000,
    });
    expect(r.content).toContain('entre $792.000 y $968.000');
    expect(r.content).toContain('no vuelvas a llamar esta herramienta');
  });

  it('ignores an upper bound that is not above the lower one', async () => {
    const flat = await quote({
      listings: 1,
      monthly_revenue_clp: 900_000,
      monthly_revenue_max_clp: 900_000,
    });
    const single = await quote({ listings: 1, monthly_revenue_clp: 900_000 });
    expect(flat.widget).toEqual(single.widget);
    expect(flat.content).toBe(single.content);
  });

  it('names the single plan and clamps the listing count', async () => {
    const r = await quote({ listings: 99, monthly_revenue_clp: 600_000 });
    expect(r.widget).toMatchObject({
      kind: 'airbnb_quote',
      planLabel: 'Plan Luxel',
      listings: 50,
      revenueClp: 600_000,
      keptClp: 26_400_000,
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

describe('get_pricing_reference', () => {
  const stay = (propertyId: string, nights: number, hostRevenueClp: number): ComparableStay => ({
    propertyId,
    nights,
    hostRevenueClp,
  });

  it('needs at least three listings before it returns a figure', () => {
    expect(MIN_COMPARABLE_LISTINGS).toBe(3);
  });

  it('refuses when too few comparable listings were matched', () => {
    const stays = [stay('a', 10, 500_000), stay('b', 10, 500_000), stay('c', 10, 500_000)];
    expect(summarizeComparables(stays, 2, 90)).toEqual({ ok: false, reason: 'small_sample' });
  });

  it('refuses when the figures would come from fewer than three listings', () => {
    const stays = [stay('a', 20, 1_000_000), stay('a', 20, 1_000_000), stay('b', 20, 1_000_000)];
    expect(summarizeComparables(stays, 9, 90)).toEqual({ ok: false, reason: 'small_sample' });
  });

  it('refuses when Luxel manages a single listing, as it does today', () => {
    expect(summarizeComparables([stay('only', 30, 1_500_000)], 1, 90)).toEqual({
      ok: false,
      reason: 'small_sample',
    });
  });

  it('refuses when the matched listings have no priced stays', () => {
    const stays = [stay('a', 0, 0), stay('b', 0, 0), stay('c', 0, 0)];
    expect(summarizeComparables(stays, 3, 90)).toEqual({ ok: false, reason: 'small_sample' });
  });

  it('aggregates ADR, occupancy and monthly revenue on a large enough sample', () => {
    const stays = ['a', 'b', 'c'].map((id) => stay(id, 30, 1_500_000));
    expect(summarizeComparables(stays, 3, 90)).toEqual({
      ok: true,
      listings: 3,
      stays: 3,
      nights: 90,
      adrClp: 50_000,
      occupancyPct: 33,
      monthlyRevenueClp: 500_000,
      windowDays: 90,
    });
  });

  it('gives Lux no numbers and the pricing proposal instead', async () => {
    const r = await runTool(
      'get_pricing_reference',
      { comuna: 'Comuna Inexistente Xyz', bedrooms: 1 },
      {},
    );
    expect(r.widget).toBeUndefined();
    expect(r.content).not.toMatch(/\$\d/);
    expect(r.content).toContain('PriceLabs');
    expect(r.content).toContain('propuesta de precios');
    expect(r.content).toContain('save_property_details');
  });
});

describe('save_property_details', () => {
  it('asks for the property details when it got none', async () => {
    const r = await runTool('save_property_details', {}, {});
    expect(r.widget).toBeUndefined();
    expect(r.content).toContain('dirección o comuna');
  });
});
