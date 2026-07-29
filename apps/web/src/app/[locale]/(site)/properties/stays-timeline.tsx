'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarDays, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
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

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MAX_MONTH_OFFSET = 3;

const monthLabel = (y: number, m: number) =>
  new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m, 1)),
  );

type CleaningState = 'confirmed' | 'notified' | 'pending';
const cleaningState = (c: Cleaning | undefined): CleaningState | null => {
  if (!c) return null;
  if (c.crew_confirmed_at || c.status === 'done') return 'confirmed';
  return c.status === 'scheduled' ? 'notified' : 'pending';
};

/** One small month grid instead of a wall of rows: reserved nights are shaded,
 *  check-out days carry a colored dot for their turnover's state, and tapping
 *  a stay opens its detail (dates, nights, real revenue when known). */
export function StaysTimeline({
  stays,
  cleanings,
  today,
}: {
  stays: Stay[];
  cleanings: Cleaning[];
  today: string;
}) {
  const t = useTranslations('stays');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Stay | null>(null);

  if (!stays.length) {
    return (
      <div className="border-border text-muted-foreground grid justify-items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm">
        <CalendarDays className="h-6 w-6 opacity-50" />
        {t('none')}
      </div>
    );
  }

  const nightOf = new Map<string, Stay>();
  const checkoutOf = new Map<string, Stay>();
  for (const s of stays) {
    for (let d = s.from; d < s.to; d = addDays(d, 1)) nightOf.set(d, s);
    checkoutOf.set(s.to, s);
  }
  const cleaningFor = (date: string) =>
    cleanings.find((c) => c.cleaning_date === date && c.status !== 'skipped');

  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1 + offset;
  const first = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      new Date(Date.UTC(year, month, i + 1)).toISOString().slice(0, 10),
    ),
  ];

  const selCleaning = selected ? cleaningState(cleaningFor(selected.to)) : null;

  return (
    <div className="grid max-w-md gap-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Mes anterior"
          disabled={offset === 0}
          onClick={() => setOffset((o) => Math.max(0, o - 1))}
          className="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold capitalize">
          {monthLabel(first.getUTCFullYear(), first.getUTCMonth())}
        </p>
        <button
          type="button"
          aria-label="Mes siguiente"
          disabled={offset >= MAX_MONTH_OFFSET}
          onClick={() => setOffset((o) => Math.min(MAX_MONTH_OFFSET, o + 1))}
          className="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="text-muted-foreground pb-1 text-[10px] font-semibold">
            {w}
          </span>
        ))}
        {cells.map((date, i) => {
          if (!date) return <span key={`x${i}`} />;
          const stay = nightOf.get(date) ?? checkoutOf.get(date);
          const night = nightOf.has(date);
          const state = checkoutOf.has(date) ? cleaningState(cleaningFor(date)) : null;
          return (
            <button
              key={date}
              type="button"
              disabled={!stay}
              onClick={() => stay && setSelected(stay)}
              className={cn(
                'relative mx-auto grid h-8 w-full max-w-9 place-items-center text-xs tabular-nums transition-colors',
                night && 'bg-primary/15',
                night && (!nightOf.has(addDays(date, -1)) ? 'rounded-l-md' : ''),
                night && (!nightOf.has(addDays(date, 1)) ? 'rounded-r-md' : ''),
                !night && 'rounded-md',
                stay && 'hover:bg-primary/25 cursor-pointer',
                date === today && 'ring-primary/60 font-bold ring-1',
                date < today && !stay && 'text-muted-foreground/50',
              )}
            >
              {Number(date.slice(8, 10))}
              {state && (
                <span
                  className={cn(
                    'absolute bottom-0.5 h-1.5 w-1.5 rounded-full',
                    state === 'confirmed' && 'bg-success',
                    state === 'notified' && 'bg-secondary',
                    state === 'pending' && 'bg-warning',
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="flex items-center gap-1">
          <span className="bg-primary/15 h-2.5 w-2.5 rounded-sm" /> {t('legend_reserved')}
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-success h-1.5 w-1.5 rounded-full" /> {t('legend_confirmed')}
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-secondary h-1.5 w-1.5 rounded-full" /> {t('legend_notified')}
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-warning h-1.5 w-1.5 rounded-full" /> {t('legend_pending')}
        </span>
      </div>

      <Modal open={selected != null} onClose={() => setSelected(null)} title={t('stay_title')}>
        {selected && (
          <div className="grid gap-3">
            <p className="text-base font-semibold">
              <span className="capitalize">{fmt(selected.from)}</span> →{' '}
              <span className="capitalize">{fmt(selected.to)}</span>
              {selected.inProgress && (
                <span className="bg-primary/10 text-primary ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  {t('in_progress')}
                </span>
              )}
            </p>
            <p className="text-muted-foreground text-sm">
              {t('nights', { n: selected.nights })}
              {selected.revenueClp != null &&
                ` · ${t('revenue', { amount: clp(selected.revenueClp) })}`}
            </p>
            <p className="flex items-center gap-1.5 text-sm">
              <Sparkles
                className={cn(
                  'h-4 w-4',
                  selCleaning === 'confirmed' && 'text-success',
                  selCleaning === 'notified' && 'text-secondary',
                  selCleaning === 'pending' && 'text-warning',
                  selCleaning == null && 'text-muted-foreground',
                )}
              />
              {selCleaning === 'confirmed'
                ? t('cleaning_confirmed')
                : selCleaning === 'notified'
                  ? t('cleaning_notified')
                  : selCleaning === 'pending'
                    ? t('cleaning_pending')
                    : t('cleaning_auto')}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
