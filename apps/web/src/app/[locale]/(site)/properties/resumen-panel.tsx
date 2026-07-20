'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Send, CalendarDays, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { askAgent } from './revenue-actions';
import type { Block } from './calendar-panel';

export type Insight = {
  occupancy_pct: number;
  underbooked: number;
  base_clp: number;
  suggestions: { date: string; price_clp: number; reason: string }[];
};

const clp = (n: number) => `$${n.toLocaleString('es-CL')}`;
const fmt = (d: string) =>
  new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${d}T00:00:00Z`),
  );

/** No buttons-to-compute: everything is already there — upcoming stays, price
 *  suggestions, and one small box to ask for anything else. */
export function ResumenPanel({
  propertyId,
  blocks,
  insight,
}: {
  propertyId: string;
  blocks: Block[];
  insight: Insight | null;
}) {
  const t = useTranslations('resumen');
  const [pending, start] = useTransition();
  const [cmd, setCmd] = useState('');
  const [reply, setReply] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = blocks
    .filter((b) => b.source === 'import' && b.ends_on >= today)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on))
    .slice(0, 4);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="border-border grid content-start gap-2 rounded-lg border p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <CalendarDays className="text-primary h-4 w-4" /> {t('upcoming')}
        </p>
        {upcoming.length === 0 && <p className="text-muted-foreground text-sm">{t('none')}</p>}
        {upcoming.map((b) => (
          <div key={b.id} className="flex items-center justify-between text-sm">
            <span>
              {fmt(b.starts_on)} → {fmt(b.ends_on)}
            </span>
            <span className="text-muted-foreground text-xs">{b.summary}</span>
          </div>
        ))}
      </div>

      <div className="border-border grid content-start gap-2 rounded-lg border p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <TrendingUp className="text-primary h-4 w-4" /> {t('prices')}
        </p>
        {insight ? (
          <>
            <p className="text-muted-foreground text-xs">
              {t('occupancy', { pct: insight.occupancy_pct, n: insight.underbooked })}
            </p>
            {insight.suggestions.slice(0, 4).map((s) => (
              <div key={s.date} className="flex items-center justify-between text-sm">
                <span>{fmt(s.date)}</span>
                <span className="font-medium tabular-nums">{clp(s.price_clp)}</span>
              </div>
            ))}
          </>
        ) : (
          <p className="text-muted-foreground text-sm">{t('no_prices')}</p>
        )}
      </div>

      <div className="sm:col-span-2">
        <div className="flex gap-1.5">
          <Input
            className="h-9 text-sm"
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            placeholder={t('agent_ph')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && cmd.trim() && !pending) {
                start(async () => {
                  const r = await askAgent({ propertyId, command: cmd.trim() });
                  setReply(r.text ?? null);
                });
              }
            }}
          />
          <Button
            size="sm"
            className="h-9"
            disabled={pending || !cmd.trim()}
            aria-label={t('send')}
            onClick={() =>
              start(async () => {
                const r = await askAgent({ propertyId, command: cmd.trim() });
                setReply(r.text ?? null);
              })
            }
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
        {reply && (
          <p className="bg-muted/50 mt-2 whitespace-pre-wrap rounded-md p-2.5 text-xs">{reply}</p>
        )}
      </div>
    </div>
  );
}
