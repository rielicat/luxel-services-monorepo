'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCLP } from '@/lib/utils';
import { setSubscriptionStatusAction } from './actions';

interface Subscription {
  id: string;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  status: 'active' | 'paused' | 'cancelled';
  amount_per_visit_clp: number;
  square_meters: number;
}

const STATUS_VARIANT: Record<Subscription['status'], 'success' | 'warning' | 'destructive'> = {
  active: 'success',
  paused: 'warning',
  cancelled: 'destructive',
};

export function SubscriptionsList({ subscriptions }: { subscriptions: Subscription[] }) {
  const t = useTranslations('account.subscription');
  const tFreq = useTranslations('calculator.fields');
  const [pending, startTransition] = useTransition();

  if (subscriptions.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-6 text-sm">
          Aún no tienes suscripciones activas.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {subscriptions.map((s) => (
        <Card key={s.id}>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">
                {tFreq(`frequency_${s.frequency}` as 'frequency_weekly')} · {s.square_meters} m²
              </CardTitle>
              <p className="text-muted-foreground text-sm">
                {formatCLP(s.amount_per_visit_clp)} {t('amount').toLowerCase()}
              </p>
            </div>
            <Badge variant={STATUS_VARIANT[s.status]}>
              {t(`status_${s.status}` as 'status_active')}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {s.status === 'active' && (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(() => setSubscriptionStatusAction(s.id, 'paused').then(() => {}))
                }
              >
                {t('pause')}
              </Button>
            )}
            {s.status === 'paused' && (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(() => setSubscriptionStatusAction(s.id, 'active').then(() => {}))
                }
              >
                {t('resume')}
              </Button>
            )}
            {s.status !== 'cancelled' && (
              <Button
                variant="destructive"
                size="sm"
                disabled={pending}
                onClick={() => {
                  if (!confirm('¿Cancelar suscripción?')) return;
                  startTransition(() =>
                    setSubscriptionStatusAction(s.id, 'cancelled').then(() => {}),
                  );
                }}
              >
                {t('cancel')}
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
