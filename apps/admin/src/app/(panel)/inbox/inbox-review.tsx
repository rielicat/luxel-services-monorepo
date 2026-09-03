'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, Sparkles, Send, Trash2, UserRound, ShieldCheck, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  approveDraft,
  rejectDraft,
  simulateReply,
  type InboxActionResult,
  type InboxThread,
} from './actions';

const fmt = (iso: string) =>
  new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Santiago',
  }).format(new Date(iso));

export function InboxReview({ threads }: { threads: InboxThread[] }) {
  const t = useTranslations('inbox');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ERROR_KEY: Record<string, string> = {
    denied: 'error_denied',
    invalid: 'error_invalid',
    empty: 'error_empty',
    no_guest_message: 'error_no_guest_message',
    no_ai: 'error_no_ai',
    send_failed: 'error_send_failed',
    no_access: 'error_no_access',
    already_decided: 'error_already_decided',
    unknown_thread: 'error_unknown_thread',
    not_found: 'error_unknown_thread',
    write_failed: 'error_write_failed',
    error: 'error_ai_failed',
  };

  const errorText = (reason?: string) => t(ERROR_KEY[reason ?? ''] ?? 'error_generic');

  const run = (id: string, fn: () => Promise<InboxActionResult>, okNote: string) => {
    setBusy(id);
    setNote(null);
    setError(null);
    start(async () => {
      const result = await fn();
      setBusy(null);
      if (result.ok) {
        setNote(okNote);
        router.refresh();
      } else {
        setError(errorText(result.reason));
      }
    });
  };

  const statusLabel = (status: string) =>
    status === 'needs_host'
      ? t('status_needs_host')
      : status === 'closed'
        ? t('status_closed')
        : t('status_open');

  const sourceLabel = (source: string) =>
    source === 'guest' ? t('msg_guest') : source === 'ai' ? t('msg_ai') : t('msg_host');

  if (!threads.length) {
    return <p className="text-muted-foreground text-sm">{t('empty')}</p>;
  }

  const withDraft = threads.filter((thread) => thread.draft);
  const rest = threads.filter((thread) => !thread.draft);

  const renderThread = (thread: InboxThread) => {
    const draft = thread.draft;
    const value = draft ? (edited[draft.id] ?? draft.body) : '';
    const working = pending && busy === thread.id;

    return (
      <Card key={thread.id} id={`t-${thread.id}`}>
        <CardContent className="grid gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{thread.propertyName}</p>
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <UserRound className="h-3.5 w-3.5" />
                {thread.guestName ?? t('guest_unknown')} · {thread.channel} ·{' '}
                {fmt(thread.updatedAt)}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  thread.status === 'needs_host'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {statusLabel(thread.status)}
              </span>
              {!thread.aiReplies && (
                <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-semibold">
                  {t('ai_off')}
                </span>
              )}
              <span
                className={cn(
                  'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  thread.aiReviews ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning',
                )}
              >
                {thread.aiReviews ? (
                  <ShieldCheck className="h-3 w-3" />
                ) : (
                  <Zap className="h-3 w-3" />
                )}
                {thread.aiReviews ? t('review_on') : t('review_off')}
              </span>
            </div>
          </div>

          <div className="border-border grid gap-2 rounded-lg border p-3">
            {thread.messages.map((message) => (
              <div key={message.id} className="grid gap-0.5">
                <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                  {sourceLabel(message.source)} · {fmt(message.createdAt)}
                </p>
                <p className="whitespace-pre-wrap text-sm">{message.body}</p>
              </div>
            ))}
          </div>

          {draft ? (
            <div className="border-primary/30 bg-primary/5 grid gap-2 rounded-lg border p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Sparkles className="text-primary h-4 w-4" />
                {t('draft_title')}
              </p>
              <p className="text-muted-foreground text-xs">
                {draft.origin === 'simulation' ? t('origin_simulation') : t('origin_inbound')}
                {draft.model ? ` · ${t('model', { model: draft.model })}` : ''}
              </p>
              <textarea
                value={value}
                onChange={(event) =>
                  setEdited((prev) => ({ ...prev, [draft.id]: event.target.value }))
                }
                rows={5}
                className="border-input bg-background focus-visible:ring-ring w-full rounded-md border p-2 text-sm focus-visible:outline-none focus-visible:ring-2"
              />
              <p className="text-muted-foreground text-xs">{t('edit_hint')}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={working || !value.trim()}
                  onClick={() =>
                    run(
                      thread.id,
                      () => approveDraft({ draftId: draft.id, body: value }),
                      t('sent_ok'),
                    )
                  }
                >
                  <Send className="h-4 w-4" />
                  {working ? t('sending') : t('send')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={working}
                  onClick={() => run(thread.id, () => simulateReply(thread.id), t('simulated_ok'))}
                >
                  <Sparkles className="h-4 w-4" />
                  {t('regenerate')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={working}
                  onClick={() =>
                    run(
                      thread.id,
                      () => rejectDraft({ draftId: draft.id, handoff: false }),
                      t('discarded_ok'),
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                  {t('discard')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={working}
                  onClick={() =>
                    run(
                      thread.id,
                      () => rejectDraft({ draftId: draft.id, handoff: true }),
                      t('discarded_ok'),
                    )
                  }
                >
                  <UserRound className="h-4 w-4" />
                  {t('discard_handoff')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-muted-foreground text-sm">{t('no_draft')}</p>
              <Button
                size="sm"
                variant="outline"
                disabled={working}
                onClick={() => run(thread.id, () => simulateReply(thread.id), t('simulated_ok'))}
              >
                <Sparkles className="h-4 w-4" />
                {working ? t('simulating') : t('simulate')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="grid gap-4">
      {note && (
        <p className="text-success flex items-center gap-1.5 text-sm font-medium">
          <Check className="h-4 w-4" /> {note}
        </p>
      )}
      {error && <p className="text-destructive text-sm font-medium">{error}</p>}

      {withDraft.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
            {t('pending_title')}
          </h2>
          {withDraft.map(renderThread)}
        </section>
      )}

      {rest.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
            {t('rest_title')}
          </h2>
          {rest.map(renderThread)}
        </section>
      )}
    </div>
  );
}
