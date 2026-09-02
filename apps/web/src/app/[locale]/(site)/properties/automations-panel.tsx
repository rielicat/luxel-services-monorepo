'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bot, Pencil, LineChart, TriangleAlert, Check, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { setPriceOptimization, updateGuestInfo } from './copilot-actions';
import { refreshPricingLink, updatePricingSettings } from './pricing-actions';
import type { LiveDay } from './stays-timeline';

const clp = (n: number) => `$${n.toLocaleString('es-CL')}`;

function Switch({
  on,
  disabled,
  onClick,
  label,
}: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors',
        on ? 'bg-primary' : 'bg-muted-foreground/30',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
          on ? 'left-[22px]' : 'left-0.5',
        )}
      />
    </button>
  );
}

export function AutomationsPanel({
  propertyId,
  priceOptEnabled,
  guestInfo,
  liveDays,
  pricelabsStatus,
}: {
  propertyId: string;
  priceOptEnabled: boolean;
  guestInfo: string | null;
  liveDays: LiveDay[] | null;
  pricelabsStatus: 'off' | 'pending_connection' | 'connected';
}) {
  const t = useTranslations('ai');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [teachOpen, setTeachOpen] = useState(false);
  const [pricesOpen, setPricesOpen] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [info, setInfo] = useState(guestInfo ?? '');
  const [saved, setSaved] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bounds, setBounds] = useState({ base: '', min: '', max: '' });
  const [boundsError, setBoundsError] = useState<string | null>(null);
  const [linkResult, setLinkResult] = useState<'idle' | 'pending' | 'unavailable'>('idle');

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const togglePricing = () =>
    run(() => setPriceOptimization({ propertyId, enabled: !priceOptEnabled }));

  const priced = (liveDays ?? []).slice(0, 30).filter((d) => d.priceClp != null);
  const min = priced.length ? Math.min(...priced.map((d) => d.priceClp!)) : null;
  const max = priced.length ? Math.max(...priced.map((d) => d.priceClp!)) : null;
  const avg = priced.length
    ? Math.round(priced.reduce((s, d) => s + d.priceClp!, 0) / priced.length)
    : null;

  const pricingLive = priceOptEnabled && pricelabsStatus === 'connected';

  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2">
      <Card className="border-primary/40">
        <CardContent className="grid gap-2 p-4">
          <div className="flex items-center gap-2.5">
            <span className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
              <Bot className="h-[18px] w-[18px]" />
            </span>
            <span className="text-sm font-semibold">{t('title')}</span>
          </div>
          <p className="text-muted-foreground text-xs">{t('body')}</p>
          <button
            type="button"
            onClick={() => setTeachOpen(true)}
            className="text-primary flex w-fit items-center gap-1 text-xs font-medium hover:underline"
          >
            <Pencil className="h-3 w-3" /> {t('teach_link')}
          </button>
        </CardContent>
      </Card>

      <Card className={cn('transition-colors', pricingLive && 'border-primary/40')}>
        <CardContent className="grid gap-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2.5">
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  pricingLive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                )}
              >
                <LineChart className="h-[18px] w-[18px]" />
              </span>
              <span className="text-sm font-semibold">{t('price_title')}</span>
            </span>
            <Switch
              on={priceOptEnabled}
              disabled={pending}
              onClick={togglePricing}
              label={t('price_title')}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            {!priceOptEnabled
              ? t('price_paused_body')
              : pricingLive
                ? t('price_on_body')
                : t('price_waiting_body')}
          </p>

          {pricelabsStatus !== 'connected' && (
            <button
              type="button"
              onClick={() => setStepsOpen(true)}
              className="text-warning flex w-fit items-center gap-1 text-xs font-medium hover:underline"
            >
              <TriangleAlert className="h-3 w-3" /> {t('price_pending_connection')}
            </button>
          )}
          {pricelabsStatus === 'connected' && (
            <>
              <p
                className={cn(
                  'flex items-center gap-1 text-xs font-medium',
                  priceOptEnabled ? 'text-success' : 'text-muted-foreground',
                )}
              >
                <Check className="h-3 w-3" />
                {priceOptEnabled ? t('price_connected') : t('price_paused_still_connected')}
              </p>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="text-primary flex w-fit items-center gap-1 text-xs font-medium hover:underline"
              >
                <SlidersHorizontal className="h-3 w-3" /> {t('price_bounds_link')}
              </button>
            </>
          )}

          {avg != null && (
            <button
              type="button"
              onClick={() => setPricesOpen(true)}
              className="text-primary flex w-fit items-center gap-1 text-xs font-medium hover:underline"
            >
              <LineChart className="h-3 w-3" /> {t('price_preview_link')}
            </button>
          )}
        </CardContent>
      </Card>

      <Modal open={teachOpen} onClose={() => setTeachOpen(false)} title={t('teach_title')}>
        <div className="grid gap-3">
          <p className="text-muted-foreground text-sm">{t('teach_body')}</p>
          <textarea
            className="border-input bg-background focus-visible:ring-ring w-full rounded-md border p-2.5 text-sm focus-visible:outline-none focus-visible:ring-2"
            rows={5}
            value={info}
            onChange={(e) => setInfo(e.target.value)}
            placeholder={t('info_ph')}
          />
          <Button
            size="sm"
            className="justify-self-start"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await updateGuestInfo({ propertyId, guestInfo: info });
                if (r.ok) {
                  setSaved(true);
                  setTimeout(() => {
                    setSaved(false);
                    setTeachOpen(false);
                  }, 800);
                }
              })
            }
          >
            {saved ? t('saved') : t('save')}
          </Button>
        </div>
      </Modal>

      <Modal
        open={pricesOpen}
        onClose={() => setPricesOpen(false)}
        title={t('price_preview_title')}
      >
        <div className="grid gap-3">
          <p className="text-muted-foreground text-sm">{t('price_preview_body')}</p>
          {avg != null && (
            <div className="grid grid-cols-3 gap-2 text-center">
              {(
                [
                  [t('price_min'), min],
                  [t('price_avg'), avg],
                  [t('price_max'), max],
                ] as const
              ).map(([label, v]) => (
                <div key={label} className="border-border rounded-lg border p-3">
                  <p className="font-display text-lg font-semibold tabular-nums">{clp(v!)}</p>
                  <p className="text-muted-foreground text-xs">{label}</p>
                </div>
              ))}
            </div>
          )}
          <p className="text-muted-foreground text-xs">{t('price_preview_note')}</p>
        </div>
      </Modal>

      <Modal open={stepsOpen} onClose={() => setStepsOpen(false)} title={t('price_steps_title')}>
        <div className="grid gap-3">
          <p className="text-muted-foreground text-sm">{t('price_steps_intro')}</p>
          <ol className="grid list-decimal gap-1.5 pl-5 text-sm">
            <li>{t('price_step_smart_pricing')}</li>
            <li>{t('price_step_1')}</li>
            <li>{t('price_step_2')}</li>
          </ol>
          <p className="text-muted-foreground text-xs">{t('price_steps_help')}</p>
          <Button
            size="sm"
            className="justify-self-start"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const r = await refreshPricingLink(propertyId);
                if (r.ok && r.status === 'connected') {
                  setLinkResult('idle');
                  setStepsOpen(false);
                } else {
                  setLinkResult(r.status === 'unavailable' ? 'unavailable' : 'pending');
                }
              })
            }
          >
            {t('price_verify_link')}
          </Button>
          {linkResult === 'pending' && (
            <p className="text-warning text-xs">{t('price_verify_not_found')}</p>
          )}
          {linkResult === 'unavailable' && (
            <p className="text-muted-foreground text-xs">{t('price_verify_unavailable')}</p>
          )}
        </div>
      </Modal>

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title={t('price_bounds_title')}
      >
        <div className="grid gap-3">
          <p className="text-muted-foreground text-sm">{t('price_bounds_body')}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ['base', t('price_bounds_base')],
                ['min', t('price_bounds_min')],
                ['max', t('price_bounds_max')],
              ] as const
            ).map(([field, label]) => (
              <div key={field} className="grid gap-1.5">
                <Label>{label}</Label>
                <Input
                  inputMode="numeric"
                  value={bounds[field]}
                  onChange={(e) =>
                    setBounds((b) => ({ ...b, [field]: e.target.value.replace(/\D/g, '') }))
                  }
                  placeholder="—"
                />
              </div>
            ))}
          </div>
          {boundsError && <p className="text-warning text-xs">{boundsError}</p>}
          <Button
            size="sm"
            className="justify-self-start"
            disabled={pending || !Object.values(bounds).some(Boolean)}
            onClick={() =>
              run(async () => {
                const num = (v: string) => (v ? Number(v) : undefined);
                const r = await updatePricingSettings({
                  propertyId,
                  base: num(bounds.base),
                  min: num(bounds.min),
                  max: num(bounds.max),
                });
                if (r.ok) {
                  setBoundsError(null);
                  setSettingsOpen(false);
                } else {
                  setBoundsError(
                    t(`price_bounds_error_${r.error === 'validation' ? 'range' : r.error}`),
                  );
                }
              })
            }
          >
            {t('price_bounds_save')}
          </Button>
          <p className="text-muted-foreground text-xs">{t('price_bounds_note')}</p>
        </div>
      </Modal>
    </div>
  );
}
