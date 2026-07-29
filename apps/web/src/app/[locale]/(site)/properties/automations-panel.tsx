'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bot, Pencil, LineChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { setAiEnabled, setPriceOptimization, updateGuestInfo } from './copilot-actions';
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

/** The two automations Luxel sells, front and center: AI guest replies and
 *  price optimization. Both opt-in, both one obvious switch. */
export function AutomationsPanel({
  propertyId,
  aiEnabled,
  priceOptEnabled,
  guestInfo,
  liveDays,
}: {
  propertyId: string;
  aiEnabled: boolean;
  priceOptEnabled: boolean;
  guestInfo: string | null;
  liveDays: LiveDay[] | null;
}) {
  const t = useTranslations('ai');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ai, setAi] = useState(aiEnabled);
  const [price, setPrice] = useState(priceOptEnabled);
  const [teachOpen, setTeachOpen] = useState(false);
  const [pricesOpen, setPricesOpen] = useState(false);
  const [info, setInfo] = useState(guestInfo ?? '');
  const [saved, setSaved] = useState(false);

  const toggleAi = () => {
    const next = !ai;
    setAi(next);
    start(async () => {
      const r = await setAiEnabled({ propertyId, enabled: next });
      if (!r.ok) setAi(!next);
      router.refresh();
    });
  };

  const togglePrice = () => {
    const next = !price;
    setPrice(next);
    start(async () => {
      const r = await setPriceOptimization({ propertyId, enabled: next });
      if (!r.ok) setPrice(!next);
      router.refresh();
    });
  };

  const priced = (liveDays ?? []).slice(0, 30).filter((d) => d.priceClp != null);
  const min = priced.length ? Math.min(...priced.map((d) => d.priceClp!)) : null;
  const max = priced.length ? Math.max(...priced.map((d) => d.priceClp!)) : null;
  const avg = priced.length
    ? Math.round(priced.reduce((s, d) => s + d.priceClp!, 0) / priced.length)
    : null;

  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2">
      <Card className={cn('transition-colors', ai && 'border-primary/40')}>
        <CardContent className="grid gap-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2.5">
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  ai ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                )}
              >
                <Bot className="h-[18px] w-[18px]" />
              </span>
              <span className="text-sm font-semibold">{t('toggle_title')}</span>
            </span>
            <Switch on={ai} disabled={pending} onClick={toggleAi} label={t('toggle_title')} />
          </div>
          <p className="text-muted-foreground text-xs">{ai ? t('on_body') : t('off_body')}</p>
          {ai && (
            <button
              type="button"
              onClick={() => setTeachOpen(true)}
              className="text-primary flex w-fit items-center gap-1 text-xs font-medium hover:underline"
            >
              <Pencil className="h-3 w-3" /> {t('teach_link')}
            </button>
          )}
        </CardContent>
      </Card>

      <Card className={cn('transition-colors', price && 'border-primary/40')}>
        <CardContent className="grid gap-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2.5">
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  price ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                )}
              >
                <LineChart className="h-[18px] w-[18px]" />
              </span>
              <span className="text-sm font-semibold">{t('price_title')}</span>
            </span>
            <Switch on={price} disabled={pending} onClick={togglePrice} label={t('price_title')} />
          </div>
          <p className="text-muted-foreground text-xs">
            {price ? t('price_on_body') : t('price_off_body')}
          </p>
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
    </div>
  );
}
