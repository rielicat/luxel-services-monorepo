import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { PostHogProvider } from '@/lib/posthog/provider';
import { Nav } from '@/components/landing/nav';
import { Footer } from '@/components/landing/footer';
import { ChatWidget } from '@/components/chat/chat-widget';
import '../globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

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
    <ClerkProvider>
      <html lang={locale} className={inter.variable} suppressHydrationWarning>
        <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
          <NextIntlClientProvider messages={messages}>
            <PostHogProvider>
              <Nav />
              <div className="min-h-[calc(100dvh-128px)]">{children}</div>
              <Footer />
              <ChatWidget />
            </PostHogProvider>
          </NextIntlClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
