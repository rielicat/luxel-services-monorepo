'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Check,
  Clock,
  Copy,
  ExternalLink,
  Home,
  LifeBuoy,
  Loader2,
  MessageCircle,
  Pencil,
  Plug,
  RefreshCw,
  Settings2,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { checkConnection, submitAirbnbEmail, type ConnectError } from './connect-actions';

export type ConnectStage =
  | 'not_started'
  | 'invite_sent'
  | 'connecting'
  | 'connected'
  | 'no_listings'
  | 'needs_operator';

export type ConnectState = {
  stage: ConnectStage;
  airbnbEmail: string | null;
  inviteUrl: string | null;
};

type ConnectView = 'form' | 'pending' | 'invite' | 'waiting' | 'no_listings' | 'operator';

function whatsappHref(text: string): string {
  const number = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '').replace(/\D/g, '');
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

function viewFor(state: ConnectState, editing: boolean): ConnectView {
  if (state.stage === 'needs_operator') return 'operator';
  if (state.stage === 'connecting' || state.stage === 'connected') return 'waiting';
  if (state.stage === 'no_listings') return 'no_listings';
  if (editing) return 'form';
  if (state.stage === 'invite_sent' && state.inviteUrl) return 'invite';
  return state.airbnbEmail ? 'pending' : 'form';
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

function TrustCard() {
  const t = useTranslations('connect');
  const lines = [t('trust_can'), t('trust_cannot'), t('trust_revoke')];
  return (
    <Card>
      <CardContent className="grid gap-2.5 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="text-primary h-4 w-4" />
          {t('trust_title')}
        </p>
        <ul className="text-muted-foreground grid gap-1.5 text-sm">
          {lines.map((line) => (
            <li key={line} className="flex gap-2">
              <Check className="text-success mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function HelpLine() {
  const t = useTranslations('onboarding');
  const c = useTranslations('connect');
  return (
    <p className="text-muted-foreground text-center text-xs">
      {t('help_pre')}{' '}
      <a
        className="text-primary underline underline-offset-2"
        href={whatsappHref(c('wa_text'))}
        target="_blank"
        rel="noreferrer"
      >
        {t('help_link')}
      </a>
    </p>
  );
}

function WhatsAppButton({ variant = 'default' }: { variant?: 'default' | 'outline' }) {
  const t = useTranslations('connect');
  return (
    <Button asChild size="lg" variant={variant} className="justify-self-start">
      <a href={whatsappHref(t('operator_wa_text'))} target="_blank" rel="noreferrer">
        <MessageCircle className="h-4 w-4" />
        {t('operator_wa')}
      </a>
    </Button>
  );
}

export function ConnectPanel({
  state,
  signupEmail,
}: {
  state: ConnectState;
  signupEmail: string | null;
}) {
  const t = useTranslations('connect');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(state.airbnbEmail ?? '');
  const [error, setError] = useState<ConnectError | null>(null);
  const [notYet, setNotYet] = useState(false);
  const [copied, setCopied] = useState(false);

  const view = viewFor(state, editing);

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

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = email.trim();
    setError(null);
    start(async () => {
      const r = await submitAirbnbEmail({ email: value });
      if (!r.ok) {
        setError(r.error ?? 'store');
        return;
      }
      setEditing(false);
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

  const onCopy = () => {
    const url = state.inviteUrl;
    if (!url) return;
    void navigator.clipboard
      .writeText(url)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  const emailForm = (
    <form onSubmit={onSubmit} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="airbnb-email">{t('email_label')}</Label>
        <Input
          id="airbnb-email"
          name="airbnb-email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder={t('email_placeholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="sm:max-w-sm"
        />
      </div>
      <Button
        type="submit"
        size="lg"
        disabled={pending || !email.trim()}
        className="justify-self-start"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
        {pending ? t('email_sending') : t('email_submit')}
      </Button>
      {errorText && (
        <p role="alert" className="text-destructive text-sm">
          {errorText}
        </p>
      )}
      <p className="text-muted-foreground text-xs">{t('email_note')}</p>
    </form>
  );

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
      <p className="text-muted-foreground text-xs">{t('waiting_slow')}</p>
    </div>
  );

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-5 p-6 sm:p-8">
          {view === 'form' && (
            <>
              <StageHead icon={Plug} title={t('title')} />
              <div className="grid gap-1.5 text-sm">
                <p>{t('intro_1')}</p>
                <p className="text-muted-foreground">{t('intro_2')}</p>
              </div>
              <HowItWorks />
              <div className="border-warning/30 bg-warning/10 grid gap-1.5 rounded-xl border p-4">
                <p className="text-warning flex items-center gap-2 text-sm font-semibold">
                  <TriangleAlert className="h-4 w-4 shrink-0" />
                  {t('email_warn_title')}
                </p>
                <p className="text-sm">{t('email_warn_body')}</p>
                {signupEmail && (
                  <p className="text-muted-foreground text-xs">
                    {t('email_signup', { email: signupEmail })}
                  </p>
                )}
              </div>
              {emailForm}
            </>
          )}

          {view === 'pending' && (
            <>
              <StageHead icon={Clock} title={t('pending_title')} />
              <p className="text-sm">
                {t('pending_body', { email: state.airbnbEmail ?? signupEmail ?? '' })}
              </p>
              <p className="text-muted-foreground text-sm">{t('pending_change')}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" />
                  {t('pending_edit')}
                </Button>
                <WhatsAppButton variant="outline" />
              </div>
            </>
          )}

          {view === 'invite' && state.inviteUrl && (
            <>
              <StageHead icon={ExternalLink} title={t('invite_title')} />
              <p className="text-sm">
                {state.airbnbEmail
                  ? t('invite_body', { email: state.airbnbEmail })
                  : t('invite_body_generic')}
              </p>
              <Button asChild size="lg" className="justify-self-start">
                <a href={state.inviteUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  {t('invite_cta')}
                </a>
              </Button>
              <p className="text-muted-foreground text-xs">{t('invite_where')}</p>
              <div className="border-border grid gap-2 rounded-xl border p-4">
                <p className="text-sm">{t('invite_fallback')}</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    readOnly
                    value={state.inviteUrl}
                    aria-label={t('invite_link_label')}
                    onFocus={(e) => e.currentTarget.select()}
                    className="font-mono text-xs"
                  />
                  <Button type="button" variant="outline" onClick={onCopy} className="shrink-0">
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? t('invite_copied') : t('invite_copy')}
                  </Button>
                </div>
              </div>
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
              <WhatsAppButton />
            </>
          )}
        </CardContent>
      </Card>

      <TrustCard />
      <HelpLine />
    </div>
  );
}
