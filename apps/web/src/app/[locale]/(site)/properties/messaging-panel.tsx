'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Send, Bot, User, Reply } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const ordered = [...threads].sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  return (
    <div className="grid gap-3">
      {ordered.length === 0 && <p className="text-muted-foreground text-xs">{t('empty')}</p>}
      {ordered.map((th) => {
        // Honest chip: "IA respondió" ONLY when an AI-authored reply actually
        // exists in the thread — imported host history never wears the label.
        const hasAiReply = th.guest_messages.some((m) => m.source === 'ai');
        const statusKey =
          th.status === 'needs_host' || th.status === 'closed'
            ? `status_${th.status}`
            : hasAiReply
              ? 'status_ai'
              : 'status_quiet';
        return (
          <div key={th.id} className="border-border/60 grid gap-1.5 rounded-md border p-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{th.guest_name ?? t('guest')}</span>
              <span
                className={th.status === 'needs_host' ? 'text-warning' : 'text-muted-foreground'}
              >
                {t(statusKey)}
              </span>
            </div>
            <div className="grid gap-1">
              {[...th.guest_messages]
                .sort((a, b) => a.created_at.localeCompare(b.created_at))
                .slice(-6)
                .map((m) => (
                  <div key={m.id} className="flex items-start gap-1 text-xs">
                    {m.source === 'guest' ? (
                      <User className="text-muted-foreground mt-0.5 h-3 w-3 shrink-0" />
                    ) : m.source === 'ai' ? (
                      <Bot className="text-primary mt-0.5 h-3 w-3 shrink-0" />
                    ) : (
                      // Host-authored (imported history or replies from here).
                      <Reply className="text-secondary mt-0.5 h-3 w-3 shrink-0" />
                    )}
                    <span className={m.direction === 'in' ? '' : 'text-muted-foreground'}>
                      {m.body}
                    </span>
                  </div>
                ))}
            </div>
            {th.status === 'needs_host' && (
              <div className="flex gap-1.5">
                <Input
                  className="h-8 text-xs"
                  value={reply[th.id] ?? ''}
                  onChange={(e) => setReply((p) => ({ ...p, [th.id]: e.target.value }))}
                  placeholder={t('reply_ph')}
                />
                <Button
                  size="sm"
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
            )}
          </div>
        );
      })}

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
