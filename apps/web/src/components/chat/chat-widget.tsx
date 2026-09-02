'use client';

import { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { Send, CalendarCheck, Sparkles, Phone, X, Home, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { LuxelMark } from '@/components/brand/logo';
import { track } from '@/lib/analytics/client';
import { EVENTS } from '@/lib/analytics/events';
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
type AirbnbQuoteWidget = {
  kind: 'airbnb_quote';
  listings: number;
  tier: 'base' | 'handoff';
  tierLabel: string;
  perListingClp: number;
  monthlyClp: number;
};
type LinksWidget = {
  kind: 'links';
  actions: { label: string; href: string; style: 'primary' | 'outline' }[];
};
type Widget = QuoteWidget | AvailabilityWidget | HandoffWidget | AirbnbQuoteWidget | LinksWidget;

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
  const { isSignedIn } = useUser();
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
    if (typeof window !== 'undefined' && localStorage.getItem('luxel.chat.human') === '1') {
      setHumanMode(true);
    }
  }, []);

  useEffect(() => {
    const text = isSignedIn ? t('bot_greeting_host') : t('bot_greeting');
    setMessages((prev) => {
      if (prev.length > 1) return prev;
      return [{ id: 'greeting', role: 'bot', text, widgets: [] }];
    });
  }, [t, isSignedIn]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (humanMode) localStorage.setItem('luxel.chat.human', '1');
  }, [humanMode]);

  useEffect(() => {
    if (!humanMode || sessionId === 'ssr') return;
    const cursorKey = `luxel.chat.cursor.${sessionId}`;
    if (!cursorRef.current && typeof window !== 'undefined') {
      cursorRef.current = localStorage.getItem(cursorKey);
    }
    let stopped = false;
    let inFlight = false;
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
      track(EVENTS.CHAT_OPENED, { session_id: sessionId });
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
  const activeId = pending ? [...messages].reverse().find((m) => m.role === 'bot')?.id : null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div
        className={cn(
          'glass shadow-lift ease-lux relative flex w-[680px] max-w-full flex-col overflow-hidden rounded-2xl ring-1 transition-shadow duration-500',
          'before:via-primary/50 before:pointer-events-none before:absolute before:inset-x-10 before:-top-px before:h-px before:bg-gradient-to-r before:from-transparent before:to-transparent',
          open
            ? 'ring-primary/15'
            : 'ring-primary/30 shadow-[0_8px_40px_-12px_hsl(var(--primary)/0.45)]',
        )}
      >
        <div
          className={cn(
            'ease-lux grid transition-[grid-template-rows] duration-300',
            open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="min-h-0 overflow-hidden">
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
                      {m.id === activeId && working && !m.text ? (
                        <span className="inline-flex items-center gap-1 py-1.5">
                          <Dot /> <Dot delay="0.15s" /> <Dot delay="0.3s" />
                        </span>
                      ) : (
                        (m.text || m.id === activeId) && (
                          <div className="text-foreground whitespace-pre-wrap text-sm leading-relaxed">
                            {m.text}
                            {m.id === activeId && !working && (
                              <span className="bg-primary ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse align-middle" />
                            )}
                          </div>
                        )
                      )}
                      {m.widgets.map((w, i) => (
                        <WidgetCard key={i} widget={w} t={t} />
                      ))}
                    </div>
                  </div>
                ),
              )}

              {showQuickReplies && (
                <div className="flex flex-wrap gap-2 pl-[2.375rem]">
                  {(isSignedIn
                    ? (['quick_host_1', 'quick_host_2', 'quick_host_3'] as const)
                    : (['quick_1', 'quick_2', 'quick_3'] as const)
                  ).map((k) => (
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
          <span className="relative ml-1 flex shrink-0 items-center">
            <LuxelMark className="h-6 w-6" />
            {!open && (
              <span
                className="bg-success absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full ring-2 ring-[hsl(var(--card))]"
                aria-hidden
              />
            )}
          </span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={openPanel}
            placeholder={isSignedIn ? t('bar_placeholder_host') : t('bar_placeholder')}
            aria-label={isSignedIn ? t('bar_placeholder_host') : t('bar_placeholder')}
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
          <Button asChild variant="default" size="sm" className="flex-1">
            <Link
              href="/book"
              onClick={() => track(EVENTS.CTA_CLICKED, { source: 'chat_quote', cta: 'agendar' })}
            >
              <CalendarCheck className="h-4 w-4" /> {t('book_cta')}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link
              href="/calculator"
              onClick={() =>
                track(EVENTS.CTA_CLICKED, { source: 'chat_quote', cta: 'calculadora' })
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
        <Button asChild variant="default" size="sm" className="mt-3 w-full">
          <Link
            href="/book"
            onClick={() =>
              track(EVENTS.CTA_CLICKED, { source: 'chat_availability', cta: 'agendar' })
            }
          >
            <CalendarCheck className="h-4 w-4" /> {t('book_cta')}
          </Link>
        </Button>
      </div>
    );
  }

  if (widget.kind === 'airbnb_quote') {
    return (
      <div className="border-border bg-background shadow-soft max-w-[90%] rounded-xl border p-3.5">
        <div className="flex items-center gap-2">
          <Home className="text-secondary h-4 w-4" />
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            {widget.tierLabel} · {widget.listings}
            {widget.listings === 1 ? ' propiedad' : ' propiedades'}
          </span>
        </div>
        <p className="font-display text-primary mt-1 text-2xl font-extrabold">
          {clp(widget.monthlyClp)}{' '}
          <span className="text-muted-foreground text-xs font-medium">{t('per_month')}</span>
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs font-medium">
          {t('airbnb_per_listing', { price: clp(widget.perListingClp) })} · {t('airbnb_commission')}
        </p>
        <Button asChild variant="default" size="sm" className="mt-3 w-full">
          <Link
            href="/calculator?service=airbnb"
            onClick={() => track(EVENTS.CTA_CLICKED, { source: 'chat_airbnb', cta: 'trial' })}
          >
            {t('airbnb_trial_cta')} <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    );
  }

  if (widget.kind === 'links') {
    return (
      <div className="flex max-w-[90%] flex-wrap gap-2">
        {widget.actions.map((a, i) => (
          <Button key={i} asChild size="sm" variant={a.style === 'primary' ? 'default' : a.style}>
            <Link
              href={a.href}
              onClick={() => track(EVENTS.CTA_CLICKED, { source: 'chat_links', cta: a.href })}
            >
              {a.label}
            </Link>
          </Button>
        ))}
      </div>
    );
  }

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
