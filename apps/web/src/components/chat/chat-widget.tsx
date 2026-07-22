'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import posthog from 'posthog-js';
import { Send, CalendarCheck, Sparkles, Phone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { LuxelMark } from '@/components/brand/logo';
import { cn } from '@/lib/utils';

type QuoteWidget = {
  kind: 'quote';
  serviceTypeSlug: string;
  squareMeters: number;
  frequency: string;
  toolsProvidedBy: string;
  totalClp: number;
  breakdown: Record<string, number>;
  distanceKm: number;
};
type AvailabilityWidget = {
  kind: 'availability';
  date: string;
  timeblocks: { timeblock: string; available: number }[];
};
type HandoffWidget = {
  kind: 'handoff';
  whatsappUrl: string | null;
  withinHours: boolean;
  openHour: number;
  closeHour: number;
};
type Widget = QuoteWidget | AvailabilityWidget | HandoffWidget;

interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  text: string;
  widgets: Widget[];
}

const STORAGE_KEY = 'luxel.chat.session';

function getOrCreateSession(): string {
  if (typeof window === 'undefined') return 'ssr';
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

const clp = (n: number) => '$' + n.toLocaleString('es-CL');

export function ChatWidget() {
  const t = useTranslations('chat');
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [working, setWorking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState('ssr');
  const [humanMode, setHumanMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<string | null>(null);

  useEffect(() => {
    setSessionId(getOrCreateSession());
    setMessages([{ id: 'greeting', role: 'bot', text: t('bot_greeting'), widgets: [] }]);
    // Survive a reload mid-handoff: stay with the person, keep polling their replies.
    if (typeof window !== 'undefined' && localStorage.getItem('luxel.chat.human') === '1') {
      setHumanMode(true);
    }
  }, [t]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (humanMode) localStorage.setItem('luxel.chat.human', '1');
  }, [humanMode]);

  // While handed off to a person, poll for operator replies (routed from WhatsApp).
  useEffect(() => {
    if (!humanMode || sessionId === 'ssr') return;
    // Resume from the last reply we actually delivered — never from the client
    // clock, which would skip replies that landed while the tab was closed. On a
    // fresh handoff there's no cursor, so the first poll pulls recent replies and
    // the id-dedup below prevents showing anything twice.
    const cursorKey = `luxel.chat.cursor.${sessionId}`;
    if (!cursorRef.current && typeof window !== 'undefined') {
      cursorRef.current = localStorage.getItem(cursorKey);
    }
    let stopped = false;
    let inFlight = false; // don't let a slow poll overlap the next interval fire
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const after = cursorRef.current ? `&after=${encodeURIComponent(cursorRef.current)}` : '';
        const res = await fetch(
          `/api/chat/poll?sessionId=${encodeURIComponent(sessionId)}${after}`,
        );
        const data = (await res.json()) as {
          ok: boolean;
          messages?: { id: string; body: string; created_at: string }[];
        };
        if (stopped || !data.ok || !data.messages?.length) return;
        const incoming = data.messages;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = incoming.filter((m) => !seen.has(m.id));
          if (!fresh.length) return prev;
          return [
            ...prev,
            ...fresh.map((m) => ({ id: m.id, role: 'bot' as const, text: m.body, widgets: [] })),
          ];
        });
        const last = incoming[incoming.length - 1];
        if (last) {
          cursorRef.current = last.created_at;
          if (typeof window !== 'undefined') localStorage.setItem(cursorKey, last.created_at);
        }
      } catch {
        /* best-effort */
      } finally {
        inFlight = false;
      }
    };
    const iv = setInterval(poll, 4000);
    void poll();
    return () => {
      stopped = true;
      clearInterval(iv);
    };
  }, [humanMode, sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, working]);

  const openPanel = () => {
    if (!open) {
      setOpen(true);
      tryCapture('chat_opened', { session_id: sessionId });
    }
  };

  const send = async (text: string) => {
    const clean = text.trim();
    if (!clean || pending) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: clean,
      widgets: [],
    };

    // Handed off to a person: forward to WhatsApp instead of the AI, stay in chat.
    if (humanMode) {
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setPending(true);
      try {
        const res = await fetch('/api/chat/human', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId, message: clean }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          open: boolean;
          forwarded: boolean;
          openHour: number;
          closeHour: number;
        };
        const note = !data.open
          ? t('human_closed', { open: data.openHour, close: data.closeHour })
          : !data.forwarded
            ? t('human_received')
            : null;
        if (note) {
          setMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: 'bot', text: note, widgets: [] },
          ]);
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'bot', text: t('human_error'), widgets: [] },
        ]);
      } finally {
        setPending(false);
      }
      return;
    }

    const botId = crypto.randomUUID();
    const history = [...messages, userMsg];
    setMessages([...history, { id: botId, role: 'bot', text: '', widgets: [] }]);
    setInput('');
    setPending(true);
    setWorking(true);

    const payload = history
      .filter((m) => m.text.trim())
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));

    const update = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === botId ? fn(m) : m)));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, messages: payload }),
      });
      if (!res.body) throw new Error('no stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          const evt = JSON.parse(line.slice(5).trim());
          if (evt.type === 'text') {
            setWorking(false);
            update((m) => ({ ...m, text: m.text + evt.value }));
          } else if (evt.type === 'tool') {
            setWorking(evt.status === 'running');
          } else if (evt.type === 'widget') {
            const { type, ...w } = evt;
            void type;
            update((m) => ({ ...m, widgets: [...m.widgets, w as Widget] }));
          } else if (evt.type === 'error') {
            setWorking(false);
            update((m) => ({ ...m, text: m.text || evt.message }));
          } else if (evt.type === 'done') {
            setWorking(false);
            if (evt.handoff) setHumanMode(true);
          }
        }
      }
    } catch {
      update((m) => ({ ...m, text: m.text || 'Error al conectar. Intenta de nuevo.' }));
    } finally {
      setPending(false);
      setWorking(false);
    }
  };

  const showQuickReplies = messages.length <= 1 && !pending;
  // The bot turn currently receiving streamed tokens (shows the blinking caret).
  const streamingId =
    pending && !working ? [...messages].reverse().find((m) => m.role === 'bot')?.id : null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      {/* One cohesive agent surface: the composer is the docked bar; the
          conversation expands above it (grid-rows trick animates the height). */}
      <div className="bg-card/95 border-border shadow-lift ease-lux flex w-[680px] max-w-full flex-col overflow-hidden rounded-2xl border backdrop-blur">
        <div
          className={cn(
            'ease-lux grid transition-[grid-template-rows] duration-300',
            open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="min-h-0 overflow-hidden">
            {/* Minimal agent header — no chat chrome */}
            <div className="border-border/60 flex items-center justify-between border-b px-4 py-2.5">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    humanMode ? 'bg-secondary' : 'bg-success animate-pulse',
                  )}
                />
                {humanMode ? t('human_name') : t('assistant_name')}
                <span className="text-muted-foreground font-normal">
                  · {humanMode ? t('human_subtitle') : t('agent_tagline')}
                </span>
              </span>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:bg-muted hover:text-foreground -mr-1 flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {humanMode && (
              <div className="bg-secondary/10 text-secondary px-4 py-2 text-center text-xs font-medium">
                {t('human_banner')}
              </div>
            )}

            <div ref={scrollRef} className="max-h-[56vh] space-y-5 overflow-y-auto px-4 py-4">
              {messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id}>
                    {m.text && (
                      <div className="bg-muted text-foreground ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md px-3.5 py-2 text-sm leading-relaxed">
                        {m.text}
                      </div>
                    )}
                  </div>
                ) : (
                  <div key={m.id} className="flex gap-2.5">
                    <span className="bg-primary/10 text-primary mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
                      <LuxelMark className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1 space-y-2.5">
                      {(m.text || m.id === streamingId) && (
                        <div className="text-foreground whitespace-pre-wrap text-sm leading-relaxed">
                          {m.text}
                          {m.id === streamingId && (
                            <span className="bg-primary ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse align-middle" />
                          )}
                        </div>
                      )}
                      {m.widgets.map((w, i) => (
                        <WidgetCard key={i} widget={w} t={t} />
                      ))}
                    </div>
                  </div>
                ),
              )}

              {working && (
                <div className="text-muted-foreground flex items-center gap-2.5">
                  <span className="bg-primary/10 text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
                    <LuxelMark className="h-4 w-4" />
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Dot /> <Dot delay="0.15s" /> <Dot delay="0.3s" />
                  </span>
                </div>
              )}

              {showQuickReplies && (
                <div className="flex flex-wrap gap-2 pl-[2.375rem]">
                  {(['quick_1', 'quick_2', 'quick_3'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => send(t(k))}
                      className="border-border bg-background hover:border-primary/40 hover:bg-accent hover:text-accent-foreground rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                    >
                      {t(k)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Composer — always visible; this row IS the docked agent bar when collapsed */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            openPanel();
            send(input);
          }}
          className={cn(
            'focus-within:border-primary/40 flex items-center gap-2 p-2.5 transition-colors',
            open && 'border-border/60 border-t',
          )}
        >
          <LuxelMark className="ml-1 h-6 w-6 shrink-0" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={openPanel}
            placeholder={t('bar_placeholder')}
            aria-label={t('bar_placeholder')}
            disabled={pending}
            className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent px-1.5 text-sm outline-none disabled:opacity-60"
          />
          <Button type="submit" size="icon" disabled={pending || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

function WidgetCard({
  widget,
  t,
}: {
  widget: Widget;
  t: ReturnType<typeof useTranslations<'chat'>>;
}) {
  if (widget.kind === 'quote') {
    return (
      <div className="border-border bg-background shadow-soft max-w-[90%] rounded-xl border p-3.5">
        <div className="flex items-center gap-2">
          <Sparkles className="text-secondary h-4 w-4" />
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            {widget.squareMeters} m² · {widget.serviceTypeSlug}
          </span>
        </div>
        <p className="font-display text-primary mt-1 text-2xl font-extrabold">
          {clp(widget.totalClp)}{' '}
          <span className="text-muted-foreground text-xs font-medium">{t('per_visit')}</span>
        </p>
        {(widget.breakdown.subscriptionDiscount ?? 0) > 0 && (
          <p className="text-success mt-0.5 text-xs font-medium">
            Incluye {clp(widget.breakdown.subscriptionDiscount ?? 0)} de descuento
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <Button asChild variant="lime" size="sm" className="flex-1">
            <Link
              href="/book"
              onClick={() => tryCapture('cta_clicked', { source: 'chat_quote', cta: 'agendar' })}
            >
              <CalendarCheck className="h-4 w-4" /> {t('book_cta')}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link
              href="/calculator"
              onClick={() =>
                tryCapture('cta_clicked', { source: 'chat_quote', cta: 'calculadora' })
              }
            >
              {t('quote_cta')}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (widget.kind === 'availability') {
    const label: Record<string, string> = { manana: 'Mañana', tarde: 'Tarde' };
    return (
      <div className="border-border bg-background shadow-soft max-w-[90%] rounded-xl border p-3.5">
        <p className="text-muted-foreground text-xs font-medium">{widget.date}</p>
        <div className="mt-2 grid gap-1.5">
          {widget.timeblocks.map((b) => (
            <div key={b.timeblock} className="flex items-center justify-between text-sm">
              <span>{label[b.timeblock] ?? b.timeblock}</span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-semibold',
                  b.available > 0 ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground',
                )}
              >
                {b.available > 0 ? `${b.available} cupos` : 'sin cupos'}
              </span>
            </div>
          ))}
        </div>
        <Button asChild variant="lime" size="sm" className="mt-3 w-full">
          <Link
            href="/book"
            onClick={() =>
              tryCapture('cta_clicked', { source: 'chat_availability', cta: 'agendar' })
            }
          >
            <CalendarCheck className="h-4 w-4" /> {t('book_cta')}
          </Link>
        </Button>
      </div>
    );
  }

  // handoff
  return (
    <div className="border-border bg-background shadow-soft max-w-[90%] rounded-xl border p-3.5">
      <p className="text-sm leading-relaxed">
        {widget.withinHours
          ? t('handoff_open')
          : t('handoff_closed', { open: widget.openHour, close: widget.closeHour })}
      </p>
      {widget.whatsappUrl && (
        <Button asChild variant="outline" size="sm" className="mt-2.5 w-full">
          <a href={widget.whatsappUrl} target="_blank" rel="noopener noreferrer">
            <Phone className="h-4 w-4" /> {t('handoff_whatsapp')}
          </a>
        </Button>
      )}
    </div>
  );
}

function Dot({ delay = '0s' }: { delay?: string }) {
  return (
    <span
      className="bg-muted-foreground/60 animate-bounce-dot inline-block h-1.5 w-1.5 rounded-full"
      style={{ animationDelay: delay }}
    />
  );
}

function tryCapture(event: string, props: Record<string, unknown>) {
  try {
    if (posthog.__loaded) posthog.capture(event, props);
  } catch {
    // ignore
  }
}
