'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Send, Bot, User, Reply, ChevronDown, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { simulateInbound, hostReply } from './messaging-actions';

export type Msg = {
  id: string;
  direction: string;
  source: string;
  body: string;
  created_at: string;
};
export type Thread = {
  id: string;
  status: string;
  guest_name: string | null;
  updated_at: string;
  guest_messages: Msg[];
};

function MsgRow({ m }: { m: Msg }) {
  return (
    <div className="flex items-start gap-1.5 text-xs">
      {m.source === 'guest' ? (
        <User className="text-muted-foreground mt-0.5 h-3 w-3 shrink-0" />
      ) : m.source === 'ai' ? (
        <Bot className="text-primary mt-0.5 h-3 w-3 shrink-0" />
      ) : (
        <Reply className="text-secondary mt-0.5 h-3 w-3 shrink-0" />
      )}
      <span className={m.direction === 'in' ? '' : 'text-muted-foreground'}>{m.body}</span>
    </div>
  );
}

/** Attention-first inbox: conversations awaiting the host are fully visible
 *  with an inline reply; everything the AI already handled stays out of the way
 *  behind a toggle. */
export function MessagingPanel({
  propertyId,
  threads,
  showSim = false,
}: {
  propertyId: string;
  threads: Thread[];
  showSim?: boolean;
}) {
  const t = useTranslations('inbox');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sim, setSim] = useState('');
  const [reply, setReply] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false);

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const ordered = [...threads].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const needsHost = ordered.filter((th) => th.status === 'needs_host');
  const rest = ordered.filter((th) => th.status !== 'needs_host');

  return (
    <div className="grid gap-3">
      {needsHost.length === 0 && (
        <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <CheckCircle2 className="text-success h-4 w-4" /> {t('all_handled')}
        </p>
      )}

      {needsHost.map((th) => (
        <div key={th.id} className="border-warning/40 grid gap-2 rounded-lg border p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold">{th.guest_name ?? t('guest')}</span>
            <span className="text-warning font-medium">{t('status_needs_host')}</span>
          </div>
          <div className="grid gap-1">
            {[...th.guest_messages]
              .sort((a, b) => a.created_at.localeCompare(b.created_at))
              .slice(-4)
              .map((m) => (
                <MsgRow key={m.id} m={m} />
              ))}
          </div>
          <div className="flex gap-1.5">
            <Input
              className="h-9 text-sm"
              value={reply[th.id] ?? ''}
              onChange={(e) => setReply((p) => ({ ...p, [th.id]: e.target.value }))}
              placeholder={t('reply_ph')}
            />
            <Button
              size="sm"
              className="h-9"
              disabled={pending || !reply[th.id]?.trim()}
              onClick={() =>
                run(async () => {
                  await hostReply({ threadId: th.id, body: reply[th.id] });
                  setReply((p) => ({ ...p, [th.id]: '' }));
                })
              }
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}

      {rest.length > 0 && (
        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-xs font-medium transition-colors"
          >
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', showAll && 'rotate-180')}
            />
            {t('toggle_all', { n: rest.length })}
          </button>
          {showAll &&
            rest.map((th) => {
              const hasAiReply = th.guest_messages.some((m) => m.source === 'ai');
              return (
                <div key={th.id} className="border-border/60 grid gap-1.5 rounded-md border p-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{th.guest_name ?? t('guest')}</span>
                    <span className="text-muted-foreground">
                      {th.status === 'closed'
                        ? t('status_closed')
                        : hasAiReply
                          ? t('status_ai')
                          : t('status_quiet')}
                    </span>
                  </div>
                  <div className="grid gap-1">
                    {[...th.guest_messages]
                      .sort((a, b) => a.created_at.localeCompare(b.created_at))
                      .slice(-3)
                      .map((m) => (
                        <MsgRow key={m.id} m={m} />
                      ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {showSim && (
        <div className="flex gap-1.5">
          <Input
            className="h-8 text-xs"
            value={sim}
            onChange={(e) => setSim(e.target.value)}
            placeholder={t('sim_ph')}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !sim.trim()}
            onClick={() =>
              run(async () => {
                await simulateInbound({ propertyId, body: sim.trim() });
                setSim('');
              })
            }
          >
            {t('sim')}
          </Button>
        </div>
      )}
    </div>
  );
}
