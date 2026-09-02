'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Sparkles, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { PLAN_KEYS, isPlanKey, type PlanKey } from '@/lib/plan-pricing';
import { planDesc, planName, planPriceLine } from '@/lib/plan-copy';
import { cn } from '@/lib/utils';
import { requestMyPlan, cancelMyPlan } from './plan-actions';

export type Plan = { plan: string; status: string } | null;

const STATUS_ICON = {
  requested: { icon: Clock, cls: 'bg-warning/15 text-warning' },
  active: { icon: CheckCircle2, cls: 'bg-success/15 text-success' },
  cancelled: { icon: XCircle, cls: 'bg-muted text-muted-foreground' },
} as const;

type Status = keyof typeof STATUS_ICON;

const isStatus = (s: string | undefined): s is Status => s != null && s in STATUS_ICON;

export function PlanBar({ plan }: { plan: Plan }) {
  const t = useTranslations('hostplan');
  const tp = useTranslations('plans');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<PlanKey | 'cancel' | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const current = isPlanKey(plan?.plan) ? plan.plan : null;
  const status = isStatus(plan?.status) ? plan.status : null;
  const showPicker = !current || status !== 'active';

  const run = (key: PlanKey | 'cancel', fn: () => Promise<{ ok: boolean }>) => {
    setBusy(key);
    setFailed(false);
    start(async () => {
      const r = await fn();
      setBusy(null);
      if (!r.ok) {
        setFailed(true);
        return;
      }
      setConfirmOpen(false);
      router.refresh();
    });
  };

  const Status = status ? STATUS_ICON[status] : null;

  return (
    <Card className={cn('mb-5', status === 'active' ? 'border-success/40' : 'border-primary/30')}>
      <CardContent className="grid gap-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                Status ? Status.cls : 'bg-primary/10 text-primary',
              )}
            >
              {Status ? <Status.icon className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
            </span>
            <div className="grid gap-0.5">
              <p className="font-display font-semibold leading-tight">
                {current ? planName(tp, current) : t('title')}
              </p>
              {current && (
                <p className="text-sm font-medium tabular-nums">{planPriceLine(tp, current)}</p>
              )}
              <p className="text-muted-foreground text-xs">
                {status ? t(status) : t('hint')}
                {current && ` · ${tp('per_listing')}`}
              </p>
            </div>
          </div>
          {current && status && status !== 'cancelled' && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setConfirmOpen(true)}
            >
              {t('cancel')}
            </Button>
          )}
        </div>

        {showPicker && (
          <div className="grid gap-3">
            {!current && <p className="text-muted-foreground text-xs">{tp('per_listing')}</p>}
            <div className="grid gap-3 sm:grid-cols-3">
              {PLAN_KEYS.map((key) => {
                const previous = current === key;
                return (
                  <div
                    key={key}
                    className={cn(
                      'grid content-start gap-2 rounded-xl border p-4 transition-colors',
                      previous ? 'border-primary/50 bg-primary/5' : 'border-border',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{planName(tp, key)}</span>
                      {previous && (
                        <span className="text-primary text-[10px] font-semibold uppercase tracking-wide">
                          {t('previous')}
                        </span>
                      )}
                    </div>
                    <p className="font-display text-base font-bold tabular-nums">
                      {planPriceLine(tp, key)}
                    </p>
                    <p className="text-muted-foreground text-xs">{planDesc(tp, key)}</p>
                    <Button
                      size="sm"
                      variant={previous ? 'default' : 'outline'}
                      className="mt-1 w-full"
                      disabled={pending}
                      onClick={() => run(key, () => requestMyPlan({ plan: key }))}
                    >
                      {busy === key ? '…' : previous ? t('rerequest') : t('choose')}
                    </Button>
                  </div>
                );
              })}
            </div>
            <p className="text-muted-foreground text-xs">{tp('included')}</p>
          </div>
        )}

        {failed && <p className="text-warning text-xs">{t('error')}</p>}
      </CardContent>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title={t('cancel_title')}>
        <div className="grid gap-4">
          <p className="text-muted-foreground text-sm">
            {t(status === 'requested' ? 'cancel_body_requested' : 'cancel_body')}
          </p>
          {failed && <p className="text-warning text-xs">{t('error')}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" disabled={pending} onClick={() => setConfirmOpen(false)}>
              {t('cancel_keep')}
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => run('cancel', () => cancelMyPlan())}
            >
              {busy === 'cancel' ? '…' : t('cancel_confirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
