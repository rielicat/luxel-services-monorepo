'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { TrendingUp, Sparkles, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getPricingSuggestions, askAgent } from './revenue-actions';

type Suggestion = { date: string; price_clp: number; reason: string };
type Insight = {
  occupancy_pct: number;
  underbooked: number;
  base_clp: number;
  suggestions: Suggestion[];
};

const clp = (n: number) => `$${n.toLocaleString('es-CL')}`;

export function RevenuePanel({ propertyId }: { propertyId: string }) {
  const t = useTranslations('revenue');
  const [pending, start] = useTransition();
  const [cmd, setCmd] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);

  return (
    <div className="border-border grid gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <TrendingUp className="text-primary h-4 w-4" /> {t('title')}
      </div>

      <div className="flex gap-1.5">
        <Input
          className="h-8 text-xs"
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          placeholder={t('agent_ph')}
        />
        <Button
          size="sm"
          disabled={pending || !cmd.trim()}
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
      {reply && <p className="bg-muted/50 whitespace-pre-wrap rounded-md p-2 text-xs">{reply}</p>}

      <Button
        size="sm"
        variant="outline"
        className="justify-self-start"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await getPricingSuggestions(propertyId);
            if (r.insight) setInsight(r.insight);
          })
        }
      >
        <Sparkles className="mr-1 h-3.5 w-3.5" /> {t('suggest')}
      </Button>

      {insight && (
        <div className="grid gap-1 text-xs">
          <p className="text-muted-foreground">
            {t('occupancy', { pct: insight.occupancy_pct })} ·{' '}
            {t('underbooked', { n: insight.underbooked })}
          </p>
          {insight.suggestions.slice(0, 5).map((s) => (
            <div key={s.date} className="flex justify-between">
              <span>{s.date}</span>
              <span className="font-medium">
                {clp(s.price_clp)} <span className="text-muted-foreground">· {s.reason}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
