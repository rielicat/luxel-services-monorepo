'use client';

import { useTranslations } from 'next-intl';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

/** One night of the listing's REAL Airbnb calendar, mapped server-side from the
 *  channel API — published price and availability, never computed locally. */
export type LiveDay = {
  date: string;
  available: boolean;
  reserved: boolean;
  priceClp: number | null;
  minStay: number | null;
};

/** Read-only mirror of the listing's REAL Airbnb calendar: per-night state and
 *  published price, exactly as the channel reports them. Availability is
 *  managed in Airbnb and reflects here automatically — no local pseudo-blocks
 *  that Airbnb would never see. */
export function LiveCalendar({ days }: { days: LiveDay[] | null }) {
  const t = useTranslations('cal');

  if (!days?.length) {
    return (
      <div className="border-border text-muted-foreground grid justify-items-center gap-2 rounded-lg border border-dashed p-10 text-center text-sm">
        <CalendarDays className="h-6 w-6 opacity-50" />
        {t('no_data')}
      </div>
    );
  }

  const months = new Map<string, LiveDay[]>();
  for (const d of days) {
    const key = d.date.slice(0, 7);
    const list = months.get(key) ?? [];
    list.push(d);
    months.set(key, list);
  }
  const monthName = (key: string) =>
    new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${key}-01T00:00:00Z`),
    );
  const mondayIndex = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
  const compactClp = (n: number) => `$${Math.round(n / 1000)}k`;

  return (
    <div className="grid gap-6">
      <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="bg-primary/20 h-3 w-3 rounded" /> {t('reserved')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-muted h-3 w-3 rounded" /> {t('blocked')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="border-border h-3 w-3 rounded border" /> {t('available')}
        </span>
      </div>

      {[...months.entries()].map(([key, list]) => (
        <section key={key}>
          <p className="mb-2 text-sm font-semibold capitalize">{monthName(key)}</p>
          <div className="grid grid-cols-7 gap-1">
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => (
              <span key={i} className="text-muted-foreground pb-1 text-center text-[10px]">
                {d}
              </span>
            ))}
            {Array.from({ length: mondayIndex(list[0]!.date) }).map((_, i) => (
              <span key={`pad-${i}`} />
            ))}
            {list.map((d) => (
              <div
                key={d.date}
                className={cn(
                  'flex min-h-11 flex-col items-center justify-center rounded-md border text-xs',
                  d.reserved
                    ? 'bg-primary/15 border-primary/20 text-primary font-medium'
                    : d.available
                      ? 'border-border bg-card'
                      : 'bg-muted text-muted-foreground border-transparent',
                )}
              >
                <span>{Number(d.date.slice(8, 10))}</span>
                {d.available && d.priceClp != null && (
                  <span className="text-muted-foreground text-[10px] tabular-nums">
                    {compactClp(d.priceClp)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      <p className="text-muted-foreground text-xs">{t('managed_note')}</p>
    </div>
  );
}
