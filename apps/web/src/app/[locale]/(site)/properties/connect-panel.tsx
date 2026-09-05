'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Check,
  Clock,
  ExternalLink,
  Home,
  LifeBuoy,
  Loader2,
  Plug,
  RefreshCw,
  Settings2,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SUPPORT_EMAIL } from '@luxel/shared/constants';
import { askForConnection, checkConnection, type ConnectError } from './connect-actions';

export type ConnectStage =
  | 'not_started'
  | 'invite_sent'
  | 'connecting'
  | 'connected'
  | 'no_listings'
  | 'needs_operator';

export type ConnectState = {
  stage: ConnectStage;
  requestedAt: string | null;
  airbnbEmail: string | null;
};

type ConnectView = 'start' | 'pending' | 'invite' | 'waiting' | 'no_listings' | 'operator';

const POLL_MS = 20_000;

function viewFor(state: ConnectState): ConnectView {
  if (state.stage === 'needs_operator') return 'operator';
  if (state.stage === 'connecting' || state.stage === 'connected') return 'waiting';
  if (state.stage === 'no_listings') return 'no_listings';
  if (state.stage === 'invite_sent') return 'invite';
  return state.requestedAt ? 'pending' : 'start';
}

function StageHead({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="bg-primary/10 text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
        <Icon className="h-5 w-5" />
      </span>
      <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
    </div>
  );
}

function HowItWorks() {
  const t = useTranslations('onboarding');
  const steps = [
    { icon: Plug, title: t('s1_title'), body: t('s1_body') },
    { icon: RefreshCw, title: t('s2_title'), body: t('s2_body') },
    { icon: Settings2, title: t('s3_title'), body: t('s3_body') },
  ];
  return (
    <ol className="border-border grid gap-4 rounded-xl border border-dashed p-4 sm:grid-cols-3">
      {steps.map(({ icon: Icon, title, body }, i) => (
        <li key={title} className="grid gap-1.5">
          <span className="bg-accent text-accent-foreground flex h-9 w-9 items-center justify-center rounded-full">
            <Icon className="h-4 w-4" />
          </span>
          <p className="text-sm font-semibold">
            {i + 1}. {title}
          </p>
          <p className="text-muted-foreground text-xs">{body}</p>
        </li>
      ))}
    </ol>
  );
}

export function ConnectPanel({ state }: { state: ConnectState }) {
  const t = useTranslations('connect');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<ConnectError | null>(null);
  const [notYet, setNotYet] = useState(false);

  const view = viewFor(state);

  const errorText =
    error === 'validation'
      ? t('error_validation')
      : error === 'auth'
        ? t('error_auth')
        : error === 'check'
          ? t('error_check')
          : error
            ? t('error_generic')
            : null;

  const polled = useRef(false);
  useEffect(() => {
    if (view !== 'invite' && view !== 'pending') return;
    const tick = async () => {
      if (polled.current || document.hidden) return;
      polled.current = true;
      try {
        const r = await checkConnection();
        if (r.ok && r.connected) router.refresh();
      } finally {
        polled.current = false;
      }
    };
    const id = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(id);
  }, [view, router]);

  const onAsk = () => {
    setError(null);
    start(async () => {
      const r = await askForConnection();
      if (!r.ok) setError(r.error ?? 'store');
      router.refresh();
    });
  };

  const onVerify = () => {
    setNotYet(false);
    setError(null);
    start(async () => {
      const r = await checkConnection();
      if (!r.ok) setError(r.error ?? 'check');
      else if (!r.connected) setNotYet(true);
      router.refresh();
    });
  };

  const verifyBlock = (label: string) => (
    <div className="grid gap-2">
      <Button type="button" onClick={onVerify} disabled={pending} className="justify-self-start">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        {pending ? t('waiting_checking') : label}
      </Button>
      {notYet && (
        <p role="status" className="text-warning text-sm">
          {t('waiting_not_yet')}
        </p>
      )}
      {errorText && (
        <p role="alert" className="text-destructive text-sm">
          {errorText}
        </p>
      )}
      <p className="text-muted-foreground text-xs">{t('waiting_slow', { email: SUPPORT_EMAIL })}</p>
    </div>
  );

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-5 p-6 sm:p-8">
          {(view === 'start' || view === 'pending') && (
            <>
              <StageHead icon={Plug} title={t('title')} />
              <div className="grid gap-1.5 text-sm">
                <p>{t('intro_1')}</p>
                <p className="text-muted-foreground">{t('intro_2')}</p>
              </div>
              <HowItWorks />
              {view === 'start' ? (
                <Button
                  type="button"
                  size="lg"
                  disabled={pending}
                  onClick={onAsk}
                  className="justify-self-start"
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plug className="h-4 w-4" />
                  )}
                  {t('start_cta')}
                </Button>
              ) : (
                <div className="border-border grid gap-1.5 rounded-xl border p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Clock className="h-4 w-4 shrink-0" />
                    {t('pending_title')}
                  </p>
                  <p className="text-sm">{t('pending_body')}</p>
                </div>
              )}
              {errorText && (
                <p role="alert" className="text-destructive text-sm">
                  {errorText}
                </p>
              )}
            </>
          )}

          {view === 'invite' && (
            <>
              <StageHead icon={ExternalLink} title={t('invite_title')} />
              <p className="text-sm">{t('invite_body')}</p>
              <p className="text-muted-foreground text-xs">{t('invite_where')}</p>
              <div className="border-border grid gap-2 border-t pt-4">
                <p className="text-sm font-semibold">{t('invite_done_pre')}</p>
                {verifyBlock(t('invite_done'))}
              </div>
            </>
          )}

          {view === 'waiting' && (
            <>
              <StageHead icon={Clock} title={t('waiting_title')} />
              <p className="text-sm">{t('waiting_body')}</p>
              {verifyBlock(t('waiting_check'))}
            </>
          )}

          {view === 'no_listings' && (
            <>
              <StageHead icon={Home} title={t('no_listings_title')} />
              <p className="text-sm">{t('no_listings_body')}</p>
              {verifyBlock(t('no_listings_check'))}
            </>
          )}

          {view === 'operator' && (
            <>
              <StageHead icon={LifeBuoy} title={t('operator_title')} />
              <p className="text-sm">{t('operator_body')}</p>
              <p className="text-sm">{t('operator_body_email', { email: SUPPORT_EMAIL })}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
