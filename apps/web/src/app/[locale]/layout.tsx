import type { Metadata } from 'next';
import { Inter, Manrope, Fraunces } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { PostHogProvider } from '@/lib/posthog/provider';
import { PostHogPageview } from '@/components/analytics/track-view';
import { StealthGate } from '@/components/stealth-gate';
import '../globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
});
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
});

export const metadata: Metadata = {
  title: { default: 'Servicios Luxel', template: '%s · Servicios Luxel' },
  description: 'Servicios de aseo profesional en Chile.',
  metadataBase: new URL('https://serviciosluxel.cl'),
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${manrope.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground min-h-dvh font-sans antialiased">
        <ClerkProvider>
          <NextIntlClientProvider messages={messages}>
            <PostHogProvider>
              <PostHogPageview />
              {/* TEMP stealth gate — deployed build only; see stealth-gate.tsx. */}
              <StealthGate>{children}</StealthGate>
            </PostHogProvider>
          </NextIntlClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
