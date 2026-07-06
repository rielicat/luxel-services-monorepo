'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import posthog from 'posthog-js';
import { MessageCircle, X, Send, CalendarCheck, Sparkles, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
type HandoffWidget = { kind: 'handoff'; whatsappUrl: string | null };
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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSessionId(getOrCreateSession());
    setMessages([{ id: 'greeting', role: 'bot', text: t('bot_greeting'), widgets: [] }]);
  }, [t]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, working]);

  const toggle = () => {
    setOpen((v) => {
      if (!v) tryCapture('chat_opened', { session_id: sessionId });
      return !v;
    });
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

  return (
    <>
      <button
        type="button"
        aria-label={open ? 'Cerrar chat' : 'Abrir chat con Lux'}
        onClick={toggle}
        className="bg-primary text-primary-foreground shadow-glow fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full transition-transform hover:scale-105"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      <div
        className={cn(
          'border-border bg-card fixed bottom-24 right-5 z-50 flex h-[560px] max-h-[calc(100dvh-7rem)] w-[380px] max-w-[calc(100vw-2.5rem)] origin-bottom-right flex-col overflow-hidden rounded-2xl border shadow-2xl transition-all',
          open ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0',
        )}
      >
        <header className="border-border from-primary to-secondary flex items-center gap-3 border-b bg-gradient-to-r p-4">
          <span className="bg-primary-foreground/15 flex h-9 w-9 items-center justify-center rounded-full">
            <LuxelMark className="h-5 w-5" />
          </span>
          <div className="text-primary-foreground">
            <h3 className="font-display text-sm font-bold leading-tight">{t('assistant_name')}</h3>
            <p className="text-primary-foreground/80 text-xs leading-tight">{t('subtitle')}</p>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((m) => (
            <div key={m.id} className="space-y-2">
              {m.text && (
                <div
                  className={cn(
                    'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground ml-auto rounded-br-md'
                      : 'bg-muted text-foreground rounded-bl-md',
                  )}
                >
                  {m.text}
                </div>
              )}
              {m.widgets.map((w, i) => (
                <WidgetCard key={i} widget={w} t={t} />
              ))}
            </div>
          ))}

          {working && (
            <div className="bg-muted text-muted-foreground inline-flex items-center gap-1.5 rounded-2xl rounded-bl-md px-3.5 py-2.5">
              <Dot /> <Dot delay="0.15s" /> <Dot delay="0.3s" />
            </div>
          )}

          {showQuickReplies && (
            <div className="flex flex-wrap gap-2 pt-1">
              {(['quick_1', 'quick_2', 'quick_3'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => send(t(k))}
                  className="border-border bg-background hover:bg-accent hover:text-accent-foreground rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                >
                  {t(k)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-border border-t p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('placeholder')}
              disabled={pending}
              aria-label={t('placeholder')}
            />
            <Button type="submit" size="icon" disabled={pending || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
          <p className="text-muted-foreground mt-2 text-center text-[10px]">{t('disclaimer')}</p>
        </div>
      </div>
    </>
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
      {widget.whatsappUrl ? (
        <Button asChild variant="secondary" size="sm" className="w-full">
          <a href={widget.whatsappUrl} target="_blank" rel="noopener noreferrer">
            <Phone className="h-4 w-4" /> WhatsApp
          </a>
        </Button>
      ) : (
        <p className="text-muted-foreground text-sm">
          Un asesor te contactará por WhatsApp a la brevedad.
        </p>
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
