'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Sparkles, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PLAN_KEYS, isPlanKey, type PlanKey } from '@/lib/plan-pricing';
import { planDesc, planName, planPriceLine } from '@/lib/plan-copy';
import { cn } from '@/lib/utils';
import { requestMyPlan, cancelMyPlan } from './plan-actions';

export type Plan = { plan: string; status: string } | null;

export function PlanBar({ plan }: { plan: Plan }) {
  const t = useTranslations('hostplan');
  const tp = useTranslations('plans');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<PlanKey>(isPlanKey(plan?.plan) ? plan.plan : 'fixed');

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const active = Boolean(plan && plan.status !== 'cancelled');
  const current = isPlanKey(plan?.plan) ? plan.plan : null;

  return (
    <Card className="border-primary/30 mb-5">
      <CardContent className="grid gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="text-primary h-5 w-5" />
            <div>
              <p className="font-display font-semibold">
                {current ? planName(tp, current) : t('title')}
              </p>
              <p className="text-muted-foreground text-xs">
                {!plan && t('hint')}
                {plan?.status === 'requested' && t('requested')}
                {plan?.status === 'active' && t('active')}
                {plan?.status === 'cancelled' && t('cancelled')}
              </p>
            </div>
          </div>
          {active ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(() => cancelMyPlan())}
            >
              {t('cancel')}
            </Button>
          ) : (
            <Button disabled={pending} onClick={() => run(() => requestMyPlan({ plan: picked }))}>
              {plan?.status === 'cancelled' ? t('reactivate') : t('request')}
            </Button>
          )}
        </div>

        {!active && (
          <div className="grid gap-2 sm:grid-cols-3">
            {PLAN_KEYS.map((key) => {
              const selected = picked === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setPicked(key)}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors',
                    selected
                      ? 'border-primary/50 bg-accent/60'
                      : 'border-border hover:border-primary/30',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{planName(tp, key)}</span>
                    {selected && <Check className="text-primary h-4 w-4" />}
                  </span>
                  <span className="mt-1 block text-sm font-medium tabular-nums">
                    {planPriceLine(tp, key)}
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    {planDesc(tp, key)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
