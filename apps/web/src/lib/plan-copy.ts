import type { useTranslations } from 'next-intl';
import {
  FIXED_BEATS_HYBRID_CLP,
  HYBRID_BEATS_COMMISSION_CLP,
  PLAN_COMMISSION_PCT,
  PLAN_FIXED_CLP,
  PLAN_HYBRID_BASE_CLP,
  PLAN_HYBRID_PCT,
  type PlanKey,
} from './plan-pricing';
import { formatCLP } from './utils';

type PlansT = ReturnType<typeof useTranslations<'plans'>>;

export function planName(t: PlansT, plan: PlanKey): string {
  return t(`${plan}_name`);
}

export function planDesc(t: PlansT, plan: PlanKey): string {
  if (plan === 'fixed') return t('fixed_desc', { from: formatCLP(FIXED_BEATS_HYBRID_CLP) });
  if (plan === 'hybrid')
    return t('hybrid_desc', {
      from: formatCLP(HYBRID_BEATS_COMMISSION_CLP),
      to: formatCLP(FIXED_BEATS_HYBRID_CLP),
    });
  return t('commission_desc', { to: formatCLP(HYBRID_BEATS_COMMISSION_CLP) });
}

export function planPriceLine(t: PlansT, plan: PlanKey): string {
  if (plan === 'fixed') return t('fixed_price', { price: formatCLP(PLAN_FIXED_CLP) });
  if (plan === 'hybrid')
    return t('hybrid_price', {
      price: formatCLP(PLAN_HYBRID_BASE_CLP),
      pct: Math.round(PLAN_HYBRID_PCT * 100),
    });
  return t('commission_price', { pct: Math.round(PLAN_COMMISSION_PCT * 100) });
}
