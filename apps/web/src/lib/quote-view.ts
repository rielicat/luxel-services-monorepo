import type { ServiceType } from '@luxel/shared';
import type { PricingConfig } from '@luxel/pricing';

export type Frequency = 'one_time' | 'weekly' | 'biweekly' | 'monthly';
export type Tools = 'customer' | 'company';

interface QuoteBreakdown {
  base: number;
  perM2: number;
  distance: number;
  tools: number;
  subscriptionDiscount: number;
}

export interface QuoteView {
  perVisitClp: number;
  breakdown: QuoteBreakdown;
  distanceKm: number | null;
  exact: boolean;
}

const VISITS_PER_MONTH: Record<Exclude<Frequency, 'one_time'>, number> = {
  weekly: 4.345,
  biweekly: 2.173,
  monthly: 1,
};

export function estimateQuote(
  serviceType: ServiceType,
  squareMeters: number,
  tools: Tools,
  frequency: Frequency,
  config: PricingConfig,
): QuoteView {
  const base = serviceType.baseRateClp;
  const perM2 = serviceType.perM2RateClp * squareMeters;
  const toolsCost = tools === 'company' ? config.toolsSurchargeClp : 0;
  const subtotal = base + perM2 + toolsCost;
  let subscriptionDiscount = 0;
  if (frequency !== 'one_time') {
    subscriptionDiscount = Math.round((subtotal * config.subscriptionDiscountPct[frequency]) / 100);
  }
  return {
    perVisitClp: subtotal - subscriptionDiscount,
    breakdown: { base, perM2, distance: 0, tools: toolsCost, subscriptionDiscount },
    distanceKm: null,
    exact: false,
  };
}

export function monthlyClp(perVisitClp: number, frequency: Frequency): number | null {
  if (frequency === 'one_time') return null;
  return Math.round(perVisitClp * VISITS_PER_MONTH[frequency]);
}

export function discountPct(frequency: Frequency, config: PricingConfig): number {
  return frequency === 'one_time' ? 0 : config.subscriptionDiscountPct[frequency];
}
