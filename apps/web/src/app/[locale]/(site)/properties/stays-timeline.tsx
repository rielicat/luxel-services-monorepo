'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarDays, TrendingUp } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import type { Block } from './properties-client';

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
  fromTime: string | null;
  toTime: string | null;
};

export type StayTimes = {
  checkinTime: string | null;
  checkoutTime: string | null;
  byCode: Record<string, { arrival: string | null; departure: string | null }>;
};

const hhmm = (t: string | null | undefined): string | null => (t ? t.slice(0, 5) : null);

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

export function buildStays(
  liveDays: LiveDay[] | null,
  blocks: Block[],
  today: string,
  times?: StayTimes,
): Stay[] {
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
    const declared = b.confirmation_code ? times?.byCode[b.confirmation_code] : undefined;
    return {
      from: b.starts_on,
      to: b.ends_on,
      nights: nightsBetween(b.starts_on, b.ends_on),
      revenueClp: priced ? revenue : null,
      inProgress: b.starts_on <= today && today < b.ends_on,
      fromTime: hhmm(declared?.arrival) ?? hhmm(times?.checkinTime),
      toTime: hhmm(declared?.departure) ?? hhmm(times?.checkoutTime),
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
      fromTime: hhmm(times?.checkinTime),
      toTime: hhmm(times?.checkoutTime),
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
const MONTHS = 12;

const monthLabel = (y: number, m: number) =>
  new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m, 1)),
  );
const shortClp = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

function monthCells(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1));
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) =>
      new Date(Date.UTC(year, month, i + 1)).toISOString().slice(0, 10),
    ),
  ];
}

export function StaysTimeline({
  stays,
  today,
  liveDays,
  recommended,
}: {
  stays: Stay[];
  today: string;
  liveDays?: LiveDay[] | null;
  recommended?: Record<string, number> | null;
}) {
  const t = useTranslations('stays');
  const [selected, setSelected] = useState<Stay | null>(null);
  if (!stays.length && !liveDays?.length) {
    return (
      <div className="border-border text-muted-foreground grid justify-items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm">
        <CalendarDays className="h-6 w-6 opacity-50" />
        {t('none')}
      </div>
    );
  }

  const nightOf = new Map<string, Stay>();
  const checkoutOf = new Map<string, Stay>();
  for (const st of stays) {
    for (let d = st.from; d < st.to; d = addDays(d, 1)) nightOf.set(d, st);
    checkoutOf.set(st.to, st);
  }
  const priceOf = new Map<string, number>();
  for (const d of liveDays ?? []) if (d.priceClp != null) priceOf.set(d.date, d.priceClp);
  const year = Number(today.slice(0, 4));
  const month0 = Number(today.slice(5, 7)) - 1;
  const hasRecommendations = Boolean(recommended && Object.keys(recommended).length);

  return (
    <div className="grid gap-3">
      <div className="max-h-[28rem] overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
        <div className="grid gap-6">
          {Array.from({ length: MONTHS }, (_, i) => {
            const d = new Date(Date.UTC(year, month0 + i, 1));
            const y = d.getUTCFullYear();
            const m = d.getUTCMonth();
            return (
              <div
                key={`${y}-${m}`}
                className="grid gap-1.5 [contain-intrinsic-size:auto_19rem] [content-visibility:auto]"
              >
                <p className="bg-card/95 sticky top-0 z-10 py-1 text-sm font-semibold backdrop-blur first-letter:uppercase">
                  {monthLabel(y, m)}
                </p>
                <div className="grid grid-cols-7 gap-y-1 text-center">
                  {WEEKDAYS.map((w, wi) => (
                    <span key={wi} className="text-muted-foreground pb-1 text-[10px] font-semibold">
                      {w}
                    </span>
                  ))}
                  {monthCells(y, m).map((date, ci) => {
                    if (!date) return <span key={`x${ci}`} />;
                    const stay = nightOf.get(date) ?? checkoutOf.get(date);
                    const night = nightOf.has(date);
                    const price = priceOf.get(date);
                    const rec = recommended?.[date];
                    const past = date < today;
                    return (
                      <button
                        key={date}
                        type="button"
                        disabled={!stay}
                        onClick={() => stay && setSelected(stay)}
                        className={cn(
                          'relative grid h-12 content-center gap-px px-0.5 text-center transition-colors',
                          night && 'bg-primary/15',
                          night && !nightOf.has(addDays(date, -1)) && 'rounded-l-md',
                          night && !nightOf.has(addDays(date, 1)) && 'rounded-r-md',
                          !night && 'rounded-md',
                          stay && 'hover:bg-primary/25 cursor-pointer',
                          date === today && 'ring-primary/60 ring-1',
                          past && 'opacity-45',
                        )}
                      >
                        <span
                          className={cn(
                            'text-xs tabular-nums leading-none',
                            date === today && 'font-bold',
                          )}
                        >
                          {Number(date.slice(8, 10))}
                        </span>
                        {price != null && (
                          <span className="text-muted-foreground text-[9px] tabular-nums leading-none">
                            {shortClp(price)}
                          </span>
                        )}
                        {rec != null && rec !== price && (
                          <span className="text-primary text-[9px] font-semibold tabular-nums leading-none">
                            {shortClp(rec)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="flex items-center gap-1">
          <span className="bg-primary/15 h-2.5 w-2.5 rounded-sm" /> {t('legend_reserved')}
        </span>
        <span className="flex items-center gap-1">{t('legend_price')}</span>
        {hasRecommendations && (
          <span className="text-primary flex items-center gap-1 font-medium">
            <TrendingUp className="h-3 w-3" /> {t('legend_recommended')}
          </span>
        )}
      </div>

      <Modal open={selected != null} onClose={() => setSelected(null)} title={t('stay_title')}>
        {selected && (
          <div className="grid gap-3">
            <p className="text-base font-semibold">
              <span className="capitalize">{fmt(selected.from)}</span>
              {selected.fromTime && (
                <span className="text-muted-foreground font-medium"> {selected.fromTime}</span>
              )}{' '}
              → <span className="capitalize">{fmt(selected.to)}</span>
              {selected.toTime && (
                <span className="text-muted-foreground font-medium"> {selected.toTime}</span>
              )}
              {selected.inProgress && (
                <span className="bg-primary/10 text-primary ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  {t('in_progress')}
                </span>
              )}
            </p>
            <p className="text-muted-foreground text-sm">
              {selected.fromTime && selected.toTime
                ? `${t('window', { from: selected.fromTime, to: selected.toTime })} · `
                : ''}
              {t('nights', { n: selected.nights })}
              {selected.revenueClp != null &&
                ` · ${t('revenue', { amount: clp(selected.revenueClp) })}`}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
