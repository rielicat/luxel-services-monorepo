import type { useTranslations } from 'next-intl';
import { PLAN_COMMISSION_PCT } from '@luxel/core/plan-pricing';

type PlansT = ReturnType<typeof useTranslations<'plans'>>;

export function planName(t: PlansT): string {
  return t('commission_name');
}

export function planDesc(t: PlansT): string {
  return t('commission_desc');
}

export function planPriceLine(t: PlansT): string {
  return t('commission_price', { pct: Math.round(PLAN_COMMISSION_PCT * 100) });
}
