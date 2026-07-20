'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, RefreshCw, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  addManualBlock,
  removeBlock,
  addCalendarFeed,
  removeCalendarFeed,
  syncNow,
} from './calendar-actions';
import type { Feed, Block } from './calendar-panel';

const DAY = 86_400_000;
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The host's calendar as a calendar: reserved nights filled, own blocks marked,
 *  tap a free day to block it, tap your block to release it. */
export function MonthCalendar({
  propertyId,
  blocks,
  feeds,
}: {
  propertyId: string;
  blocks: Block[];
  feeds: Feed[];
}) {
  const t = useTranslations('cal');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [offset, setOffset] = useState(0);
  const [feedUrl, setFeedUrl] = useState('');

  const today = iso(new Date());
  const base = new Date();
  const first = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1));
  const monthLabel = new Intl.DateTimeFormat('es-CL', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(first);

  const dayMap = useMemo(() => {
    const m = new Map<string, { source: string; id: string }>();
    for (const b of blocks) {
      let d = new Date(`${b.starts_on}T00:00:00Z`);
      const end = new Date(`${b.ends_on}T00:00:00Z`);
      while (d < end) {
        const key = iso(d);
        // A reserved night wins over a manual block on the same day.
        if (b.source === 'import' || !m.has(key)) m.set(key, { source: b.source, id: b.id });
        d = new Date(d.getTime() + DAY);
      }
    }
    return m;
  }, [blocks]);

  // Monday-first grid.
  const lead = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), i + 1))),
    ),
  ];

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const onDay = (day: string) => {
    if (pending || day < today) return;
    const state = dayMap.get(day);
    if (!state) {
      const end = iso(new Date(new Date(`${day}T00:00:00Z`).getTime() + DAY));
      run(() => addManualBlock({ propertyId, startsOn: day, endsOn: end }));
    } else if (state.source === 'manual') {
      run(() => removeBlock(state.id));
    }
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <Button
          size="sm"
          variant="ghost"
          aria-label={t('prev')}
          onClick={() => setOffset((o) => o - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="font-display text-sm font-semibold capitalize">{monthLabel}</p>
        <Button
          size="sm"
          variant="ghost"
          aria-label={t('next')}
          onClick={() => setOffset((o) => o + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-muted-foreground text-xs font-medium">
            {w}
          </span>
        ))}
        {cells.map((day, i) =>
          day === null ? (
            <span key={`x-${i}`} />
          ) : (
            (() => {
              const state = dayMap.get(day);
              const past = day < today;
              const cls = past
                ? 'text-muted-foreground/40'
                : state?.source === 'import'
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : state
                    ? 'bg-warning/25 text-foreground font-medium'
                    : 'hover:bg-muted';
              return (
                <button
                  key={day}
                  type="button"
                  disabled={past || pending || state?.source === 'import'}
                  onClick={() => onDay(day)}
                  className={`aspect-square rounded-md text-sm tabular-nums transition-colors disabled:cursor-default ${cls}`}
                  aria-label={day}
                >
                  {Number(day.slice(-2))}
                </button>
              );
            })()
          ),
        )}
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="bg-primary inline-block h-2.5 w-2.5 rounded-sm" /> {t('reserved')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-warning/40 inline-block h-2.5 w-2.5 rounded-sm" /> {t('blocked')}
        </span>
        <span>{t('hint')}</span>
      </div>

      <details className="text-xs">
        <summary className="text-muted-foreground cursor-pointer select-none">
          {t('advanced')}
        </summary>
        <div className="mt-2 grid gap-2">
          {feeds.map((f) => (
            <div
              key={f.id}
              className="text-muted-foreground flex items-center justify-between gap-2"
            >
              <span className="truncate">
                {f.label} · {f.ical_url}
              </span>
              <button
                type="button"
                aria-label={t('remove')}
                disabled={pending}
                onClick={() => run(() => removeCalendarFeed(f.id))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
              placeholder={t('feed_ph')}
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={pending || !feedUrl.trim()}
              onClick={() =>
                run(async () => {
                  await addCalendarFeed({ propertyId, label: 'ical', url: feedUrl.trim() });
                  setFeedUrl('');
                })
              }
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            {feeds.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                aria-label={t('sync')}
                onClick={() => run(() => syncNow(propertyId))}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
