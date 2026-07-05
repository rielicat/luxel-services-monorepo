'use client';

import { useTranslations } from 'next-intl';
import { Sparkles, MapPinOff, CalendarCheck, Repeat, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { formatCLP, cn } from '@/lib/utils';
import { Link } from '@/i18n/routing';
import { monthlyClp, discountPct, type QuoteView, type Frequency } from '@/lib/quote-view';
import type { PricingConfig } from '@luxel/pricing';

interface Props {
  view: QuoteView | null;
  frequency: Frequency;
  pending: boolean;
  error: 'out_of_area' | 'generic' | null;
  config: PricingConfig;
  cta: { serviceTypeId?: string; squareMeters: number };
}

export function QuoteResult({ view, frequency, pending, error, config, cta }: Props) {
  const t = useTranslations('calculator.result');
  const tErr = useTranslations('errors');

  if (error === 'out_of_area') {
    return (
      <Card className="border-warning/40 bg-warning/5 shadow-soft">
        <CardContent className="flex items-start gap-3 p-6">
          <MapPinOff className="text-warning mt-0.5 h-6 w-6 shrink-0" />
          <p className="text-sm">{tErr('out_of_service_area')}</p>
        </CardContent>
      </Card>
    );
  }
  if (error === 'generic') {
    return (
      <Card className="shadow-soft">
        <CardContent className="p-6">
          <p className="text-destructive text-sm">{tErr('generic')}</p>
        </CardContent>
      </Card>
    );
  }
  if (!view) {
    return (
      <Card className="shadow-soft">
        <CardContent className="text-muted-foreground p-6 text-sm">{t('empty')}</CardContent>
      </Card>
    );
  }

  const isSub = frequency !== 'one_time';
  const monthly = monthlyClp(view.perVisitClp, frequency);
  const pct = discountPct(frequency, config);
  const bookHref =
    `/agendar?frequency=${frequency}&squareMeters=${cta.squareMeters}` +
    (cta.serviceTypeId ? `&serviceTypeId=${cta.serviceTypeId}` : '');

  return (
    <Card className="border-primary/15 shadow-glow relative overflow-hidden">
      <div aria-hidden className="bg-aurora pointer-events-none absolute inset-0 opacity-70" />
      <CardContent className="relative p-6">
        {/* Label */}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide">
            <Sparkles className="text-secondary h-3.5 w-3.5" />
            {view.exact ? t('exact') : t('estimated')}
          </span>
          {pct > 0 && <Badge variant="lime">−{pct}%</Badge>}
        </div>

        {/* Per-visit price */}
        <div className={cn('mt-2 transition-opacity', pending && 'opacity-60')}>
          <div className="font-display text-primary text-5xl font-extrabold leading-none">
            <AnimatedNumber value={view.perVisitClp} format={formatCLP} />
          </div>
          <p className="text-muted-foreground mt-1.5 text-sm">
            {t('per_visit')}
            {pending && <span className="ml-2 animate-pulse">· {t('updating')}</span>}
          </p>
        </div>

        {/* Monthly subscription */}
        {isSub && monthly != null && (
          <div className="border-primary/15 bg-primary/5 mt-4 flex items-center justify-between rounded-xl border p-3.5">
            <span className="text-foreground inline-flex items-center gap-2 text-sm font-medium">
              <Repeat className="text-primary h-4 w-4" />
              {t('monthly')}
            </span>
            <span className="text-right">
              <span className="font-display text-lg font-bold">
                ≈ <AnimatedNumber value={monthly} format={formatCLP} />
              </span>
              <span className="text-muted-foreground ml-1 text-xs">{t('per_month')}</span>
            </span>
          </div>
        )}
        {isSub && view.breakdown.subscriptionDiscount > 0 && (
          <p className="text-success mt-2 text-center text-xs font-medium">
            {t('save_prefix')} {formatCLP(view.breakdown.subscriptionDiscount)} {t('per_visit')}{' '}
            {t('vs_one_time')}
          </p>
        )}

        <Separator className="my-5" />

        {/* Breakdown */}
        <dl className="grid gap-2 text-sm">
          <Row label={t('base')} value={formatCLP(view.breakdown.base)} />
          <Row label={t('per_m2_label')} value={formatCLP(view.breakdown.perM2)} />
          {view.breakdown.tools > 0 && (
            <Row label={t('tools_label')} value={formatCLP(view.breakdown.tools)} />
          )}
          {view.breakdown.distance > 0 && (
            <Row label={t('distance')} value={formatCLP(view.breakdown.distance)} />
          )}
          {view.breakdown.subscriptionDiscount > 0 && (
            <Row
              label={t('discount_applied')}
              value={`− ${formatCLP(view.breakdown.subscriptionDiscount)}`}
              className="text-primary"
            />
          )}
        </dl>

        {!view.exact && (
          <p className="text-muted-foreground mt-4 flex items-start gap-1.5 text-xs">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t('add_address')}
          </p>
        )}

        <Button asChild variant="lime" size="lg" className="mt-5 w-full">
          <Link href={bookHref as never}>
            <CalendarCheck className="h-4 w-4" /> {t('book_now')}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`flex justify-between ${className}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
