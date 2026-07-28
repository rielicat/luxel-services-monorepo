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

const nightsBetween = (from: string, to: string) =>
  Math.max(
    1,
    Math.round(
      (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY,
    ),
  );

/** Stay boundaries come from the synced RESERVATIONS (one block per booking) —
 *  the live calendar only says "reserved", so consecutive runs would glue
 *  back-to-back bookings into one giant fake stay. The calendar's job here is
 *  pricing: a stay gets a revenue figure only when every one of its nights has
 *  a published price in the window (an in-progress stay's past nights don't,
 *  so no invented totals). Reserved days not covered by any block — bookings
 *  newer than the last sync — still surface as boundary-less runs. */
export function buildStays(liveDays: LiveDay[] | null, blocks: Block[], today: string): Stay[] {
  const price = new Map<string, number>();
  for (const d of liveDays ?? []) if (d.priceClp != null) price.set(d.date, d.priceClp);

  const imported = blocks
    .filter((b) => b.source === 'import' && b.ends_on >= today)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));

  const covered = new Set<string>();
  const stays: Stay[] = imported.map((b) => {
    let revenue = 0;
    let priced = liveDays != null;
    for (let d = b.starts_on; d < b.ends_on; d = addDays(d, 1)) {
      covered.add(d);
      const p = price.get(d);
      if (p == null) priced = false;
      else revenue += p;
    }
    return {
      from: b.starts_on,
      to: b.ends_on,
      nights: nightsBetween(b.starts_on, b.ends_on),
      revenueClp: priced ? revenue : null,
      inProgress: b.starts_on <= today && today < b.ends_on,
    };
  });

  let run: { from: string; nights: number; revenue: number; priced: boolean } | null = null;
  const close = (to: string) => {
    if (!run) return;
    stays.push({
      from: run.from,
      to,
      nights: run.nights,
      revenueClp: run.priced ? run.revenue : null,
      inProgress: run.from <= today && today < to,
    });
    run = null;
  };
  for (const d of liveDays ?? []) {
    if (d.reserved && !covered.has(d.date)) {
      if (!run) run = { from: d.date, nights: 0, revenue: 0, priced: true };
      run.nights++;
      if (d.priceClp != null) run.revenue += d.priceClp;
      else run.priced = false;
    } else close(d.date);
  }
  if (run && liveDays?.length) close(addDays(liveDays[liveDays.length - 1]!.date, 1));

  return stays.sort((a, b) => a.from.localeCompare(b.from));
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
