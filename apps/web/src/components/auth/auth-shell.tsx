import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { BadgeCheck, CalendarClock, Lock, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { LuxelLogo } from '@/components/brand/logo';

/** Clerk appearance shared by the sign-in and sign-up widgets. The surrounding
 *  shell frames the card, so the widget itself renders borderless/transparent. */
export const authAppearance = {
  layout: {
    // Never surface Clerk's own chrome — we render our own headings + switch link.
    unsafe_disableDevelopmentModeWarnings: true,
  },
  variables: {
    colorPrimary: 'hsl(175 78% 26%)',
    borderRadius: '0.75rem',
    fontFamily: 'var(--font-sans)',
  },
  elements: {
    rootBox: 'w-full',
    cardBox: 'w-full shadow-none border-0',
    card: 'w-full bg-transparent shadow-none border-0 p-0',
    header: 'hidden',
    // Remove Clerk's own sign-in/sign-up switch (we render our own) and the
    // "Secured by Clerk" badge — but NOT the whole footer, so the "Use another
    // method" fallback on password/code screens stays reachable. The dev-mode
    // warning is handled separately by unsafe_disableDevelopmentModeWarnings.
    footerAction: 'hidden',
    footerItem: 'hidden',
    formButtonPrimary: 'shadow-soft',
  },
} as const;

const POINTS: { icon: LucideIcon; key: 'instant' | 'verified' | 'flexible' | 'secure' }[] = [
  { icon: Zap, key: 'instant' },
  { icon: BadgeCheck, key: 'verified' },
  { icon: CalendarClock, key: 'flexible' },
  { icon: Lock, key: 'secure' },
];

export async function AuthShell({
  mode,
  children,
}: {
  mode: 'sign-in' | 'sign-up';
  children: ReactNode;
}) {
  const t = await getTranslations('auth');
  const title = mode === 'sign-in' ? t('sign_in_title') : t('sign_up_title');
  const subtitle = mode === 'sign-in' ? t('sign_in_subtitle') : t('sign_up_subtitle');

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="bg-primary relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(45% 45% at 12% 8%, hsl(var(--secondary) / 0.45) 0%, transparent 70%),' +
              'radial-gradient(40% 40% at 90% 4%, hsl(var(--lime) / 0.28) 0%, transparent 70%),' +
              'radial-gradient(60% 60% at 80% 100%, hsl(175 84% 11% / 0.6) 0%, transparent 70%)',
          }}
        />
        <Link
          href="/"
          className="relative w-fit rounded-xl bg-white/10 px-3 py-2 backdrop-blur transition-opacity hover:opacity-90"
        >
          <LuxelLogo />
        </Link>

        <div className="animate-fade-in-up relative max-w-md space-y-4">
          <h2 className="font-display text-3xl font-bold leading-tight tracking-tight xl:text-4xl">
            {t('panel_headline')}
          </h2>
          <p className="text-white/80">{t('panel_subtitle')}</p>
          <ul className="grid gap-3 pt-4">
            {POINTS.map(({ icon: Icon, key }) => (
              <li key={key} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium text-white/90">{t(`point_${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">© Servicios Luxel</p>
      </aside>

      {/* Form panel */}
      <section className="flex flex-col items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Link href="/" className="inline-block">
              <LuxelLogo />
            </Link>
          </div>
          <div className="animate-fade-in-up mb-6 space-y-1.5">
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            <p className="text-muted-foreground text-sm">{subtitle}</p>
          </div>
          {children}

          <p className="text-muted-foreground mt-6 text-center text-sm">
            {mode === 'sign-in' ? t('switch_to_sign_up_prompt') : t('switch_to_sign_in_prompt')}{' '}
            <Link
              href={mode === 'sign-in' ? '/sign-up' : '/sign-in'}
              className="text-primary font-semibold hover:underline"
            >
              {mode === 'sign-in' ? t('switch_to_sign_up_cta') : t('switch_to_sign_in_cta')}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
