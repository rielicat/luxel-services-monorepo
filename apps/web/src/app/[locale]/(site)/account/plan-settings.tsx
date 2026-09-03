'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { requestMyPlan, cancelMyPlan } from './plan-actions';

export type Plan = { plan: string; status: string } | null;

const STATE = {
  none: {
    label: 'state_none',
    body: 'body_none',
    tone: 'bg-muted text-muted-foreground',
  },
  requested: {
    label: 'state_requested',
    body: 'body_requested',
    tone: 'bg-warning/15 text-warning',
  },
  active: {
    label: 'state_active',
    body: 'body_active',
    tone: 'bg-success/15 text-success',
  },
  cancelled: {
    label: 'state_cancelled',
    body: 'body_cancelled',
    tone: 'bg-muted text-muted-foreground',
  },
} as const;

type Status = keyof typeof STATE;

const isStatus = (s: string | undefined): s is Status => s != null && s in STATE;

export function PlanSettings({ plan }: { plan: Plan }) {
  const t = useTranslations('account.plan');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<'request' | 'cancel' | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const status: Status = isStatus(plan?.status) ? plan.status : 'none';
  const open = status === 'requested' || status === 'active';
  const state = STATE[status];

  const run = (key: 'request' | 'cancel', fn: () => Promise<{ ok: boolean }>) => {
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

  return (
    <Card>
      <CardContent className="grid gap-4 p-6">
        <span className={cn('w-fit rounded-full px-2.5 py-1 text-xs font-semibold', state.tone)}>
          {t(state.label)}
        </span>

        <p className="text-muted-foreground text-sm">{t(state.body)}</p>

        <div className="flex flex-wrap items-center gap-3">
          {open ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setConfirmOpen(true)}
            >
              {t('cancel')}
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run('request', () => requestMyPlan())}
            >
              {busy === 'request' ? '…' : status === 'cancelled' ? t('rerequest') : t('request')}
            </Button>
          )}
          {failed && <span className="text-warning text-xs">{t('error')}</span>}
        </div>
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
