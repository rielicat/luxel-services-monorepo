'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { planMonthlyCost } from '@/lib/plan-pricing';
import { planDesc, planName, planPriceLine } from '@/lib/plan-copy';
import { formatCLP } from '@/lib/utils';

const MIN = 0;
const MAX = 4_000_000;
const STEP = 50_000;
const DEFAULT = 1_500_000;
const MIN_LISTINGS = 1;
const MAX_LISTINGS = 50;

function clampListings(value: number): number {
  if (!Number.isFinite(value)) return MIN_LISTINGS;
  return Math.min(MAX_LISTINGS, Math.max(MIN_LISTINGS, Math.round(value)));
}

export function FeeEstimator() {
  const t = useTranslations('calculator');
  const tp = useTranslations('plans');
  const [revenue, setRevenue] = useState(DEFAULT);
  const [listingsInput, setListingsInput] = useState(String(MIN_LISTINGS));
  const listings = clampListings(Number(listingsInput));
  const fee = planMonthlyCost(revenue) * listings;
  const net = (revenue - planMonthlyCost(revenue)) * listings;

  return (
    <div>
      <header className="text-center">
        <h1 className="text-balance font-serif text-4xl font-medium tracking-tight sm:text-5xl">
          {t('title')}
        </h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-pretty text-lg">
          {t('subtitle')}
        </p>
      </header>

      <Card className="mt-10">
        <CardContent className="grid gap-8 p-6 sm:p-8">
          <div className="grid gap-3">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
              <label htmlFor="revenue" className="text-sm font-semibold">
                {t('revenue_label')}
              </label>
              <output
                htmlFor="revenue"
                className="font-display text-2xl font-bold tabular-nums sm:text-3xl"
              >
                {formatCLP(revenue)}
              </output>
            </div>
            <input
              id="revenue"
              type="range"
              min={MIN}
              max={MAX}
              step={STEP}
              value={revenue}
              onChange={(e) => setRevenue(Number(e.target.value))}
              className="accent-primary h-2 w-full cursor-pointer"
            />
            <div className="text-muted-foreground flex justify-between text-xs tabular-nums">
              <span>{formatCLP(MIN)}</span>
              <span>{formatCLP(MAX)}</span>
            </div>
            <p className="text-muted-foreground text-xs">{t('revenue_hint')}</p>
          </div>

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <label htmlFor="listings" className="text-sm font-semibold">
                {t('listings_label')}
              </label>
              <input
                id="listings"
                type="number"
                inputMode="numeric"
                min={MIN_LISTINGS}
                max={MAX_LISTINGS}
                step={1}
                value={listingsInput}
                onChange={(e) => setListingsInput(e.target.value)}
                onBlur={() => setListingsInput(String(listings))}
                className="border-border focus:border-primary w-20 rounded-lg border bg-transparent px-3 py-1.5 text-right text-sm font-semibold tabular-nums outline-none"
              />
            </div>
            <p className="text-muted-foreground text-xs">{t('listings_hint')}</p>
          </div>

          <div
            aria-live="polite"
            className="border-primary/40 bg-primary/5 flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
          >
            <div className="min-w-0">
              <h2 className="font-display text-base font-semibold">{t('fee_label')}</h2>
              <p className="text-muted-foreground mt-0.5 text-sm">
                {planName(tp)} · {planPriceLine(tp)}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">{tp('per_listing')}</p>
            </div>
            <div className="shrink-0 sm:text-right">
              <p className="font-display text-3xl font-bold tabular-nums sm:text-4xl">
                {formatCLP(fee)}{' '}
                <span className="text-muted-foreground text-xs font-medium">{t('per_month')}</span>
              </p>
              {listings > 1 && (
                <p className="text-muted-foreground text-xs tabular-nums">
                  {t('total_listings', { n: listings })}
                </p>
              )}
              <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                {t('net', { amount: formatCLP(net) })}
              </p>
            </div>
          </div>

          <div className="text-muted-foreground grid gap-2 text-sm">
            <p className="text-pretty">{planDesc(tp)}</p>
            <p className="flex items-start gap-2">
              <Check className="text-success mt-0.5 h-4 w-4 shrink-0" />
              <span>{tp('included')}</span>
            </p>
            <p className="text-xs">{t('note')}</p>
          </div>

          <div>
            <Button asChild variant="default" size="xl" className="w-full">
              <Link href="/sign-up">
                {t('cta')} <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <p className="text-muted-foreground mt-2 text-center text-xs">{t('cta_hint')}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
