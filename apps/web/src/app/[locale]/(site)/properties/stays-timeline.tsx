'use client';

import { useTranslations } from 'next-intl';
import { CalendarDays, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Block } from './properties-client';
import type { Cleaning } from './cleaning-panel';

/** One night of the listing's REAL Airbnb calendar, mapped server-side from the
 *  channel API — published price and availability, never computed locally. */
export type LiveDay = {
  date: string;
  available: boolean;
  reserved: boolean;
  priceClp: number | null;
  minStay: number | null;
};

export type Stay = {
  from: string;
  to: string;
  nights: number;
  revenueClp: number | null;
  inProgress: boolean;
};

const DAY = 86_400_000;
const addDays = (d: string, n: number) =>
  new Date(new Date(`${d}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);
const fmt = (d: string) =>
  new Intl.DateTimeFormat('es-CL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${d}T00:00:00Z`));
const clp = (n: number) => `$${n.toLocaleString('es-CL')}`;

/** Reserved runs from the live calendar (with per-stay revenue from the real
 *  nightly rates), falling back to synced reservation blocks. */
export function buildStays(liveDays: LiveDay[] | null, blocks: Block[], today: string): Stay[] {
  if (liveDays?.length) {
    const stays: Stay[] = [];
    let run: { from: string; nights: number; revenue: number; priced: boolean } | null = null;
    const close = (to: string) => {
      if (!run) return;
      stays.push({
        from: run.from,
        to,
        nights: run.nights,
        revenueClp: run.priced ? run.revenue : null,
        inProgress: run.from <= today,
      });
      run = null;
    };
    for (const d of liveDays) {
      if (d.reserved) {
        if (!run) run = { from: d.date, nights: 0, revenue: 0, priced: true };
        run.nights++;
        if (d.priceClp != null) run.revenue += d.priceClp;
        else run.priced = false;
      } else close(d.date);
    }
    if (run) close(addDays(liveDays[liveDays.length - 1]!.date, 1));
    return stays;
  }
  return blocks
    .filter((b) => b.source === 'import' && b.ends_on >= today)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on))
    .map((b) => ({
      from: b.starts_on,
      to: b.ends_on,
      nights: Math.max(
        1,
        Math.round(
          (new Date(`${b.ends_on}T00:00:00Z`).getTime() -
            new Date(`${b.starts_on}T00:00:00Z`).getTime()) /
            DAY,
        ),
      ),
      revenueClp: null,
      inProgress: b.starts_on <= today,
    }));
}

/** The calendar that matters for a managed property: upcoming stays, what each
 *  one earns, and the turnover that follows every check-out. */
export function StaysTimeline({ stays, cleanings }: { stays: Stay[]; cleanings: Cleaning[] }) {
  const t = useTranslations('stays');

  if (!stays.length) {
    return (
      <div className="border-border text-muted-foreground grid justify-items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm">
        <CalendarDays className="h-6 w-6 opacity-50" />
        {t('none')}
      </div>
    );
  }

  const cleaningFor = (checkout: string) =>
    cleanings.find((c) => c.cleaning_date === checkout && c.status !== 'skipped');

  return (
    <div className="grid gap-2">
      {stays.slice(0, 8).map((s) => {
        const cleaning = cleaningFor(s.to);
        return (
          <div
            key={s.from}
            className="border-border flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
          >
            <div>
              <p className="text-sm font-medium">
                <span className="capitalize">{fmt(s.from)}</span> →{' '}
                <span className="capitalize">{fmt(s.to)}</span>
                {s.inProgress && (
                  <span className="bg-primary/10 text-primary ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    {t('in_progress')}
                  </span>
                )}
              </p>
              <p className="text-muted-foreground text-xs">
                {t('nights', { n: s.nights })}
                {s.revenueClp != null && ` · ${t('revenue', { amount: clp(s.revenueClp) })}`}
              </p>
            </div>
            <span
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                cleaning
                  ? cleaning.status === 'scheduled'
                    ? 'bg-success/10 text-success'
                    : 'bg-warning/15 text-warning'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              <Sparkles className="h-3 w-3" />
              {cleaning
                ? cleaning.status === 'scheduled'
                  ? t('cleaning_scheduled')
                  : t('cleaning_pending')
                : t('cleaning_auto')}
            </span>
          </div>
        );
      })}
    </div>
  );
}
