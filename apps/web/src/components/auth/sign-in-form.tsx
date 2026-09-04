'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, useSignIn } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GoogleButton } from './google-button';
import { authErrorKey, safeRedirect } from './clerk-error';

const RESEND_SECONDS = 30;

export function SignInForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const params = useSearchParams();
  const { isLoaded, signIn, setActive } = useSignIn();
  const { isSignedIn } = useAuth();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  const redirectTo = safeRedirect(params.get('redirect_url'));

  useEffect(() => {
    if (isSignedIn) router.replace(redirectTo);
  }, [isSignedIn, redirectTo, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  const prepare = async (resend: boolean) => {
    if (!isLoaded || !signIn) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const attempt = resend ? signIn : await signIn.create({ identifier: email.trim() });
      const factor = attempt.supportedFirstFactors?.find((f) => f.strategy === 'email_code');
      if (!factor || !('emailAddressId' in factor)) {
        setError(t('err_generic'));
        return;
      }
      await signIn.prepareFirstFactor({
        strategy: 'email_code',
        emailAddressId: factor.emailAddressId,
      });
      setStep('code');
      setCooldown(RESEND_SECONDS);
      if (resend) setNotice(t('resent'));
    } catch (err) {
      setError(t(authErrorKey(err)));
    } finally {
      setPending(false);
    }
  };

  const onEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError(t('err_email_invalid'));
      return;
    }
    void prepare(false);
  };

  const onCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const done = await signIn.attemptFirstFactor({ strategy: 'email_code', code: code.trim() });
      if (done.status === 'complete' && done.createdSessionId) {
        await setActive({ session: done.createdSessionId });
        router.push(redirectTo);
        return;
      }
      setError(t('err_generic'));
    } catch (err) {
      setError(t(authErrorKey(err)));
    } finally {
      setPending(false);
    }
  };

  const onGoogle = async () => {
    if (!isLoaded || !signIn) return;
    setPending(true);
    setError(null);
    try {
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: `/sso-callback?redirect_url=${encodeURIComponent(redirectTo)}`,
        redirectUrlComplete: redirectTo,
      });
    } catch (err) {
      setError(t(authErrorKey(err)));
      setPending(false);
    }
  };

  const busy = pending || !isLoaded;

  if (isSignedIn) return null;

  return (
    <div className="grid gap-4">
      {step === 'email' ? (
        <>
          <GoogleButton onClick={() => void onGoogle()} disabled={busy} />

          <div className="flex items-center gap-3">
            <span className="bg-border h-px flex-1" />
            <span className="text-muted-foreground text-xs">{t('or')}</span>
            <span className="bg-border h-px flex-1" />
          </div>

          <form onSubmit={onEmail} noValidate className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="auth-email">{t('email_label')}</Label>
              <Input
                id="auth-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                autoFocus
                required
                placeholder={t('email_ph')}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'auth-error' : undefined}
              />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('continue')}
              {busy ? null : <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>
        </>
      ) : (
        <form onSubmit={onCode} noValidate className="grid gap-3">
          <p className="text-muted-foreground text-sm">{t('code_sent', { email: email.trim() })}</p>
          <div className="grid gap-1.5">
            <Label htmlFor="auth-code">{t('code_label')}</Label>
            <Input
              id="auth-code"
              ref={codeRef}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              placeholder={t('code_ph')}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ''));
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'auth-error' : undefined}
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={busy || code.length < 6}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('verify')}
          </Button>
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="link"
              size="sm"
              className="px-0"
              onClick={() => {
                setStep('email');
                setCode('');
                setError(null);
                setNotice(null);
              }}
            >
              {t('back')}
            </Button>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="px-0"
              disabled={busy || cooldown > 0}
              onClick={() => void prepare(true)}
            >
              {cooldown > 0 ? t('resend_in', { s: cooldown }) : t('resend')}
            </Button>
          </div>
        </form>
      )}

      <p id="auth-error" aria-live="polite" className="min-h-5 text-sm">
        {error ? <span className="text-destructive font-medium">{error}</span> : null}
        {!error && notice ? <span className="text-muted-foreground">{notice}</span> : null}
      </p>
    </div>
  );
}
