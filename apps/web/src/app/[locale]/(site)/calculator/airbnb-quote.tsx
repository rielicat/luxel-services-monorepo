'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Minus, Plus, Check, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PLAN_KEYS, cheapestPlan, planMonthlyCost, type PlanKey } from '@/lib/plan-pricing';
import { planDesc, planName, planPriceLine } from '@/lib/plan-copy';
import { formatCLP, cn } from '@/lib/utils';

const MIN = 1;
const MAX = 20;
const INCLUDED = ['inc1', 'inc2', 'inc3', 'inc4', 'inc5'] as const;

export function AirbnbQuote() {
  const t = useTranslations('calculator.airbnb');
  const tp = useTranslations('plans');
  const [listings, setListings] = useState(1);
  const [plan, setPlan] = useState<PlanKey>('fixed');
  const [revenue, setRevenue] = useState('');
  const revenueClp = revenue ? Number(revenue) : 0;
  const perUnit = planMonthlyCost(plan, revenueClp);
  const total = listings * perUnit;
  const cheapest = revenue ? cheapestPlan(revenueClp) : null;
  const clamp = (n: number) => Math.min(MAX, Math.max(MIN, n));

  return (
    <div>
      <header className="text-center">
        <h1 className="font-serif text-4xl font-medium tracking-tight sm:text-5xl">{t('title')}</h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-lg">{t('subtitle')}</p>
      </header>

      <Card className="mt-10">
        <CardContent className="grid gap-6 p-7">
          <div className="grid gap-3">
            <label className="text-sm font-semibold">{t('plan_label')}</label>
            <div className="grid gap-3 sm:grid-cols-3">
              {PLAN_KEYS.map((key) => {
                const active = plan === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPlan(key)}
                    className={cn(
                      'rounded-xl border p-4 text-left transition-all',
                      active
                        ? 'border-primary ring-primary/20 bg-primary/5 ring-1'
                        : 'border-input hover:border-primary/40',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{planName(tp, key)}</span>
                      <span
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded-full border',
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input',
                        )}
                      >
                        {active && <Check className="h-3 w-3" />}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">{planDesc(tp, key)}</p>
                    <p className="font-display mt-2 text-base font-bold tabular-nums">
                      {planPriceLine(tp, key)}
                    </p>
                    {cheapest === key && (
                      <p className="text-primary mt-1 text-xs font-semibold">{t('cheapest')}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-3">
              <label className="text-sm font-semibold">{t('listings_label')}</label>
              <div className="flex items-center gap-4">
                <div className="border-input flex items-center rounded-lg border">
                  <button
                    type="button"
                    aria-label="−"
                    disabled={listings <= MIN}
                    onClick={() => setListings((n) => clamp(n - 1))}
                    className="hover:bg-muted flex h-11 w-11 items-center justify-center rounded-l-lg transition-colors disabled:opacity-40"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="font-display w-14 text-center text-2xl font-bold tabular-nums">
                    {listings}
                  </span>
                  <button
                    type="button"
                    aria-label="+"
                    disabled={listings >= MAX}
                    onClick={() => setListings((n) => clamp(n + 1))}
                    className="hover:bg-muted flex h-11 w-11 items-center justify-center rounded-r-lg transition-colors disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-muted-foreground text-sm">
                  {listings === 1 ? t('unit_one') : t('unit_many')}
                </span>
              </div>
            </div>
            <div className="grid gap-3">
              <label htmlFor="revenue" className="text-sm font-semibold">
                {t('revenue_label')}
              </label>
              <Input
                id="revenue"
                inputMode="numeric"
                placeholder="800000"
                value={revenue}
                onChange={(e) => setRevenue(e.target.value.replace(/\D/g, ''))}
              />
              <p className="text-muted-foreground text-xs">{t('revenue_hint')}</p>
            </div>
          </div>

          <div className="border-border bg-muted/40 flex items-end justify-between rounded-xl border p-5">
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                {t('total_label')}
              </p>
              <p className="font-display text-4xl font-bold tabular-nums">{formatCLP(total)}</p>
              <p className="text-muted-foreground mt-1 text-xs">{t('vat_note')}</p>
            </div>
            <p className="text-muted-foreground hidden text-right text-sm sm:block">
              {formatCLP(perUnit)}
              <br />
              {t('per_unit')}
            </p>
          </div>

          <div className="grid gap-2">
            <p className="text-sm font-semibold">{t('included_title')}</p>
            <ul className="grid gap-1.5">
              {INCLUDED.map((k) => (
                <li key={k} className="text-muted-foreground flex items-start gap-2 text-sm">
                  <Check className="text-success mt-0.5 h-4 w-4 shrink-0" /> {t(k)}
                </li>
              ))}
            </ul>
          </div>

          <Button asChild variant="default" size="xl" className="w-full">
            <Link href="/properties">
              {t('cta')} <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
