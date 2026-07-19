'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { startPlan, cancelMyPlan, extendMyTrial } from './plan-actions';

export type Plan = { plan: string; status: string; trial_ends_at: string | null } | null;

function daysLeft(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export function PlanBar({ plan }: { plan: Plan }) {
  const t = useTranslations('hostplan');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [winback, setWinback] = useState(false);

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const active = Boolean(plan && plan.status !== 'cancelled');

  return (
    <Card className="border-primary/30 mb-5">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="text-primary h-5 w-5" />
          <div>
            <p className="font-display font-semibold">{t('ai_name')}</p>
            <p className="text-muted-foreground text-xs">
              {!plan && t('price')}
              {plan?.status === 'trialing' && t('trialing', { days: daysLeft(plan.trial_ends_at) })}
              {plan?.status === 'active' && t('active')}
              {plan?.status === 'cancelled' && t('cancelled')}
            </p>
          </div>
        </div>

        {!active ? (
          <Button disabled={pending} onClick={() => run(() => startPlan({ plan: 'ai' }))}>
            {plan?.status === 'cancelled' ? t('reactivate') : t('start_trial')}
          </Button>
        ) : winback ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs">{t('winback_body')}</span>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await extendMyTrial();
                  setWinback(false);
                })
              }
            >
              {t('winback_extend')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await cancelMyPlan();
                  setWinback(false);
                })
              }
            >
              {t('winback_confirm')}
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => setWinback(true)}>
            {t('cancel')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
