'use client';

import { useTranslations } from 'next-intl';
import { CalendarDays, TrendingUp, Bot, Sparkles } from 'lucide-react';
import type { PropertyRow } from './properties-client';

/** One night of the listing's REAL Airbnb calendar, mapped server-side from the
 *  channel API — published price and availability, never computed locally. */
export type LiveDay = {
  date: string;
  available: boolean;
  reserved: boolean;
  priceClp: number | null;
  minStay: number | null;
};

const clp = (n: number) => `$${n.toLocaleString('es-CL')}`;
const fmt = (d: string) =>
  new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${d}T00:00:00Z`),
  );
const DAY = 86_400_000;
const addDays = (d: string, n: number) =>
  new Date(new Date(`${d}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);

/** Consecutive reserved nights → stays. Checkout is the morning after the last
 *  reserved night (Airbnb semantics). */
function staysFromLiveDays(days: LiveDay[]): { from: string; to: string; nights: number }[] {
  const stays: { from: string; to: string; nights: number }[] = [];
  let run: { from: string; nights: number } | null = null;
  for (const d of days) {
    if (d.reserved) {
      if (run) run.nights++;
      else run = { from: d.date, nights: 1 };
    } else if (run) {
      stays.push({ from: run.from, to: d.date, nights: run.nights });
      run = null;
    }
  }
  if (run)
    stays.push({ from: run.from, to: addDays(days[days.length - 1]!.date, 1), nights: run.nights });
  return stays;
}

/** The management overview, fed exclusively by real product data: the listing's
 *  live Airbnb calendar (stays + published rates), the AI messaging state, and
 *  the coordinated cleanings. Host questions go to the global Lux agent — no
 *  duplicate per-property chat here. */
export function ResumenPanel({
  property,
  liveDays,
}: {
  property: PropertyRow;
  liveDays: LiveDay[] | null;
}) {
  const t = useTranslations('resumen');

  const today = new Date().toISOString().slice(0, 10);

  // Stays: live calendar first, locally synced import blocks as fallback.
  const stays = liveDays
    ? staysFromLiveDays(liveDays).slice(0, 3)
    : property.calendar_blocks
        .filter((b) => b.source === 'import' && b.ends_on >= today)
        .sort((a, b) => a.starts_on.localeCompare(b.starts_on))
        .slice(0, 3)
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
        }));

  // Published rates for the next open nights — straight from the anuncio.
  const openNights = (liveDays ?? []).filter((d) => d.available && d.priceClp != null);
  const reservedCount = (liveDays ?? []).filter((d) => d.reserved).length;
  const occupancyPct = liveDays?.length
    ? Math.round((reservedCount / liveDays.length) * 100)
    : null;

  // AI messaging state from the real threads.
  const sevenDaysAgo = new Date(Date.now() - 7 * DAY).toISOString();
  const aiReplies7d = property.guest_threads
    .flatMap((th) => th.guest_messages ?? [])
    .filter((m) => m.source === 'ai' && m.created_at >= sevenDaysAgo).length;
  const needsReply = property.guest_threads.filter((th) => th.status === 'needs_host').length;

  // Coordinated cleanings ahead.
  const cleanings = property.cleanings
    .filter((c) => c.status !== 'skipped' && c.status !== 'done' && c.cleaning_date >= today)
    .sort((a, b) => a.cleaning_date.localeCompare(b.cleaning_date))
    .slice(0, 3);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section className="border-border grid content-start gap-2 rounded-lg border p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <CalendarDays className="text-primary h-4 w-4" /> {t('upcoming')}
        </p>
        {stays.length === 0 && <p className="text-muted-foreground text-sm">{t('none')}</p>}
        {stays.map((s) => (
          <div key={s.from} className="flex items-center justify-between text-sm">
            <span>
              {fmt(s.from)} → {fmt(s.to)}
            </span>
            <span className="text-muted-foreground text-xs">{t('nights', { n: s.nights })}</span>
          </div>
        ))}
      </section>

      <section className="border-border grid content-start gap-2 rounded-lg border p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <TrendingUp className="text-primary h-4 w-4" /> {t('prices')}
        </p>
        {liveDays ? (
          <>
            {occupancyPct != null && (
              <p className="text-muted-foreground text-xs">
                {t('occupancy', { pct: occupancyPct, n: openNights.length })}
              </p>
            )}
            {openNights.slice(0, 4).map((d) => (
              <div key={d.date} className="flex items-center justify-between text-sm">
                <span>{fmt(d.date)}</span>
                <span className="font-medium tabular-nums">{clp(d.priceClp!)}</span>
              </div>
            ))}
            {openNights.length === 0 && (
              <p className="text-muted-foreground text-sm">{t('fully_booked')}</p>
            )}
          </>
        ) : (
          <p className="text-muted-foreground text-sm">{t('no_prices')}</p>
        )}
      </section>

      <section className="border-border grid content-start gap-2 rounded-lg border p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Bot className="text-primary h-4 w-4" /> {t('ai_title')}
        </p>
        <p className="text-sm">{t('ai_replies_7d', { n: aiReplies7d })}</p>
        {needsReply > 0 ? (
          <p className="text-warning text-sm font-medium">{t('ai_pending', { n: needsReply })}</p>
        ) : (
          <p className="text-muted-foreground text-sm">{t('ai_all_clear')}</p>
        )}
      </section>

      <section className="border-border grid content-start gap-2 rounded-lg border p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="text-primary h-4 w-4" /> {t('cleanings_title')}
        </p>
        {cleanings.length === 0 && (
          <p className="text-muted-foreground text-sm">{t('cleanings_none')}</p>
        )}
        {cleanings.map((c) => (
          <div key={c.id} className="flex items-center justify-between text-sm">
            <span>{fmt(c.cleaning_date)}</span>
            <span className="text-muted-foreground text-xs">
              {c.status === 'scheduled' ? t('cleaning_scheduled') : t('cleaning_suggested')}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
