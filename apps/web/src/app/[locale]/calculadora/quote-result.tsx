'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatCLP } from '@/lib/utils';
import { Link } from '@/i18n/routing';
import type { QuoteActionResult } from './actions';

interface Props {
  result: QuoteActionResult | null;
  pending: boolean;
  frequency: 'one_time' | 'weekly' | 'biweekly' | 'monthly';
}

export function QuoteResult({ result, pending, frequency }: Props) {
  const t = useTranslations('calculator.result');
  const tCommon = useTranslations('common');
  const tErr = useTranslations('errors');

  if (pending) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-6 text-sm">
          {tCommon('loading')}
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-6 text-sm">
          Completa el formulario para ver tu cotización.
        </CardContent>
      </Card>
    );
  }

  if (!result.ok || !result.quote) {
    const errKey = result.error === 'out_of_area' ? 'out_of_service_area' : 'generic';
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-destructive text-sm">{tErr(errKey)}</p>
        </CardContent>
      </Card>
    );
  }

  const q = result.quote;
  const params = new URLSearchParams({
    serviceTypeId: q.serviceTypeId,
    operationPointId: q.operationPointId,
    total: String(q.totalClp),
    frequency,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-base font-medium">{t('total')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="text-4xl font-bold tabular-nums">{formatCLP(q.totalClp)}</div>
        {frequency !== 'one_time' && (
          <p className="text-muted-foreground -mt-2 text-sm">{t('per_visit')}</p>
        )}

        <Separator />

        <dl className="grid gap-2 text-sm">
          <Row label="Tarifa base" value={formatCLP(q.breakdown.base)} />
          <Row label="Por m²" value={formatCLP(q.breakdown.perM2)} />
          {q.breakdown.tools > 0 && (
            <Row label="Insumos Luxel" value={formatCLP(q.breakdown.tools)} />
          )}
          {q.breakdown.distance > 0 && (
            <Row label={t('distance')} value={formatCLP(q.breakdown.distance)} />
          )}
          {q.breakdown.subscriptionDiscount > 0 && (
            <Row
              label={t('discount_applied')}
              value={`− ${formatCLP(q.breakdown.subscriptionDiscount)}`}
              className="text-primary"
            />
          )}
        </dl>

        <p className="text-muted-foreground text-xs">≈ {q.distanceKm} km</p>

        <Button asChild className="w-full">
          <Link href={`/agendar?${params.toString()}` as never}>{t('book_now')}</Link>
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
