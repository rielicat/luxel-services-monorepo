'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarClock, Pause, Play, Sparkles, X } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatCLP, cn } from '@/lib/utils';
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

const VISITS_PER_MONTH: Record<Subscription['frequency'], number> = {
  weekly: 4,
  biweekly: 2,
  monthly: 1,
};

export function SubscriptionsList({ subscriptions }: { subscriptions: Subscription[] }) {
  const t = useTranslations('account.subscription');
  const tFreq = useTranslations('calculator.fields');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const run = (id: string, status: Subscription['status']) => {
    setBusyId(id);
    startTransition(async () => {
      await setSubscriptionStatusAction(id, status);
      setBusyId(null);
    });
  };

  if (subscriptions.length === 0) {
    return (
      <Card className="shadow-soft flex flex-col items-center gap-4 border-dashed p-10 text-center">
        <span className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-2xl">
          <Sparkles className="h-6 w-6" />
        </span>
        <div className="space-y-1.5">
          <p className="font-display text-lg font-semibold">{t('empty_title')}</p>
          <p className="text-muted-foreground mx-auto max-w-sm text-sm">{t('empty_desc')}</p>
        </div>
        <Button asChild variant="lime">
          <Link href="/book?frequency=weekly">{t('empty_cta')}</Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {subscriptions.map((s) => {
        const monthly = s.amount_per_visit_clp * VISITS_PER_MONTH[s.frequency];
        const busy = busyId === s.id;
        const cancelled = s.status === 'cancelled';
        return (
          <Card key={s.id} className={cn('shadow-soft overflow-hidden', cancelled && 'opacity-70')}>
            <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <span className="bg-primary/10 text-primary hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl sm:flex">
                  <CalendarClock className="h-6 w-6" />
                </span>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-base font-semibold">
                      {tFreq(`frequency_${s.frequency}` as 'frequency_weekly')}
                    </span>
                    <Badge variant={STATUS_VARIANT[s.status]}>
                      {t(`status_${s.status}` as 'status_active')}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm">{s.square_meters} m²</p>
                </div>
              </div>

              <div className="sm:text-right">
                <p className="text-xl font-bold tabular-nums">
                  {formatCLP(s.amount_per_visit_clp)}
                  <span className="text-muted-foreground ml-1 text-sm font-normal">
                    {t('amount')}
                  </span>
                </p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {t('monthly_estimate', { amount: formatCLP(monthly) })}
                </p>
              </div>
            </div>

            {!cancelled && (
              <div className="bg-muted/40 border-border/60 flex flex-wrap items-center gap-2 border-t px-5 py-3">
                {s.status === 'active' && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => run(s.id, 'paused')}
                  >
                    <Pause className="mr-1.5 h-3.5 w-3.5" />
                    {t('pause')}
                  </Button>
                )}
                {s.status === 'paused' && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => run(s.id, 'active')}
                  >
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    {t('resume')}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto"
                  onClick={() => {
                    if (confirm(t('cancel_confirm'))) run(s.id, 'cancelled');
                  }}
                >
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  {t('cancel')}
                </Button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
