'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MessageCircle, X, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  text: string;
  i18nKey?: string;
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

export function ChatWidget() {
  const t = useTranslations('chat');
  const tFaq = useTranslations('faq.a');
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState('ssr');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSessionId(getOrCreateSession());
    setMessages([{ id: 'greeting', role: 'bot', text: t('bot_greeting') }]);
  }, [t]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async (text: string, handoff = false) => {
    if (!text.trim() && !handoff) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setPending(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text || '(handoff)', sessionId, handoff }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        reply?: { i18nKey?: string | null; text?: string };
        kind?: string;
      };
      if (data.ok && data.reply) {
        const reply = data.reply;
        const replyText = reply.i18nKey ? safeT(tFaq, reply.i18nKey) : (reply.text ?? '…');
        setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'bot', text: replyText }]);
      }
    } catch {
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: 'bot', text: 'Error al enviar. Intenta de nuevo.' },
      ]);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Abrir chat"
        onClick={() => setOpen((v) => !v)}
        className="bg-primary text-primary-foreground fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition hover:scale-105"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      <div
        className={cn(
          'border-border bg-card fixed bottom-24 right-5 z-50 flex h-[480px] w-[360px] origin-bottom-right flex-col overflow-hidden rounded-xl border shadow-2xl transition-all',
          open ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0',
        )}
      >
        <header className="border-border border-b p-4">
          <h3 className="font-semibold">{t('title')}</h3>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                m.role === 'user' ? 'bg-primary text-primary-foreground ml-auto' : 'bg-muted',
              )}
            >
              {m.text}
            </div>
          ))}
          {pending && (
            <div className="bg-muted text-muted-foreground rounded-lg px-3 py-2 text-sm">…</div>
          )}
        </div>

        <div className="border-border border-t p-3">
          <button
            type="button"
            onClick={() => send('Hablar con persona', true)}
            className="border-input hover:bg-muted mb-2 w-full rounded-md border p-2 text-xs"
          >
            {t('fallback_to_human')}
          </button>
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
            />
            <Button type="submit" size="icon" disabled={pending || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}

function safeT(t: (k: string) => string, key: string): string {
  // FAQ keys live under "faq.a.*" — strip prefix if present.
  const k = key.startsWith('faq.a.') ? key.slice('faq.a.'.length) : key;
  try {
    return t(k);
  } catch {
    return '…';
  }
}
