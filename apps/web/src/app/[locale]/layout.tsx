import type { Metadata } from 'next';
import { Inter, Manrope, Fraunces } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { SITE_URL } from '@luxel/shared/constants';
import { PostHogProvider } from '@/lib/posthog/provider';
import { PostHogPageview } from '@/components/analytics/track-view';
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('landing');
  const seo = await getTranslations('seo');
  return {
    title: { default: seo('site_name'), template: `%s · ${seo('site_name')}` },
    description: t('meta_description'),
    metadataBase: new URL(SITE_URL),
    applicationName: seo('site_name'),
    openGraph: {
      type: 'website',
      siteName: seo('site_name'),
      locale: 'es_CL',
      url: SITE_URL,
      title: seo('site_name'),
      description: t('meta_description'),
    },
    twitter: {
      card: 'summary_large_image',
      title: seo('site_name'),
      description: t('meta_description'),
    },
    robots: { index: true, follow: true },
  };
}

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
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/properties"
          signUpFallbackRedirectUrl="/properties"
        >
          <NextIntlClientProvider messages={messages}>
            <PostHogProvider>
              <PostHogPageview />
              {children}
            </PostHogProvider>
          </NextIntlClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
