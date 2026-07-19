'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Sparkles, RefreshCw, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { refreshCleanings, getTurnoverPrice, setCleaningStatus } from './cleaning-actions';

export type Cleaning = {
  id: string;
  cleaning_date: string;
  status: string;
  price_clp: number | null;
  source: string;
};

const clp = (n: number | null) => (n == null ? '—' : `$${n.toLocaleString('es-CL')}`);

export function CleaningPanel({
  propertyId,
  cleanings,
}: {
  propertyId: string;
  cleanings: Cleaning[];
}) {
  const t = useTranslations('cleaning');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [price, setPrice] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const upcoming = [...cleanings]
    .filter((c) => c.status !== 'skipped')
    .sort((a, b) => a.cleaning_date.localeCompare(b.cleaning_date));

  return (
    <div className="border-border grid gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <Sparkles className="text-primary h-4 w-4" /> {t('title')}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await getTurnoverPrice(propertyId);
              setPrice(r.priceClp != null ? clp(r.priceClp) : t(`err_${r.error ?? 'generic'}`));
            })
          }
        >
          {t('price_turnover')}
        </Button>
        {price && <span className="text-sm font-semibold">{price}</span>}
      </div>
      <p className="text-muted-foreground text-xs">{t('price_help')}</p>

      <div className="grid gap-1.5">
        {upcoming.length === 0 && <p className="text-muted-foreground text-xs">{t('none')}</p>}
        {upcoming.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate">
              {c.cleaning_date} · {clp(c.price_clp)} · {t(`status_${c.status}`)}
            </span>
            <span className="flex shrink-0 gap-1.5">
              {c.status !== 'scheduled' && (
                <button
                  type="button"
                  aria-label={t('schedule')}
                  disabled={pending}
                  onClick={() =>
                    run(() => setCleaningStatus({ cleaningId: c.id, status: 'scheduled' }))
                  }
                >
                  <Check className="text-success h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                aria-label={t('skip')}
                disabled={pending}
                onClick={() =>
                  run(() => setCleaningStatus({ cleaningId: c.id, status: 'skipped' }))
                }
              >
                <X className="text-muted-foreground h-3.5 w-3.5" />
              </button>
            </span>
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => refreshCleanings(propertyId))}
        >
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> {t('refresh')}
        </Button>
      </div>
    </div>
  );
}
