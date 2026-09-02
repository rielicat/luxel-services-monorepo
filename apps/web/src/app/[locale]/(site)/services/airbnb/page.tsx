import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { ArrowRight, HelpCircle } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { ChatOpenButton } from '@/components/chat/chat-open-button';
import { ServiceHero } from '@/components/sections/service-hero';
import { SectionHeading } from '@/components/sections/section-heading';
import { ScopeGrid } from '@/components/landing/scope';
import { HowItWorks } from '@/components/landing/how-it-works';
import { Plans } from '@/components/landing/plans';
import { Reveal } from '@/components/ui/reveal';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('services.airbnb');
  return { title: t('meta_title') };
}

export default function AirbnbServicePage() {
  const t = useTranslations('services.airbnb');
  const ts = useTranslations('landing.scope');

  return (
    <main>
      <ServiceHero
        title={t('title')}
        subtitle={t.rich('subtitle', {
          hl: (chunks) => <span className="text-primary font-semibold">{chunks}</span>,
        })}
        image={{ src: '/img/jmi/living.jpg', alt: t('hero_alt') }}
      >
        <Button asChild variant="default" size="xl" className="w-full sm:w-auto">
          <Link href="/calculator">{t('cta_primary')}</Link>
        </Button>
        <ChatOpenButton className="w-full sm:w-auto">{t('cta_secondary')}</ChatOpenButton>
      </ServiceHero>

      <Reveal>
        <section className="container py-20 sm:py-24">
          <SectionHeading title={ts('title')} subtitle={ts('subtitle')} />
          <ScopeGrid />
        </section>
      </Reveal>

      <Reveal>
        <HowItWorks />
      </Reveal>

      <Reveal>
        <Plans />
      </Reveal>

      <Reveal>
        <section className="container py-20 sm:py-24">
          <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1fr_1.4fr]">
            <div className="border-border bg-card shadow-soft flex flex-col rounded-2xl border p-8">
              <div className="bg-primary/10 text-primary flex h-11 w-11 items-center justify-center rounded-xl">
                <HelpCircle className="h-5 w-5" />
              </div>
              <h2 className="font-display mt-5 text-xl font-semibold">{t('faq_title')}</h2>
              <p className="text-muted-foreground mt-2 flex-1 text-sm leading-relaxed">
                {t('faq_body')}
              </p>
              <Button asChild variant="outline" size="lg" className="mt-6 w-full sm:w-fit">
                <Link href="/#faq">
                  {t('faq_cta')} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="from-primary to-secondary shadow-lift relative overflow-hidden rounded-2xl bg-gradient-to-br p-8 text-center sm:p-10">
              <div aria-hidden className="bg-dot-grid absolute inset-0 opacity-20" />
              <div className="relative">
                <h2 className="text-primary-foreground text-balance font-serif text-3xl font-medium sm:text-4xl">
                  {t('cta_title')}
                </h2>
                <p className="text-primary-foreground/85 mx-auto mt-3 max-w-md text-pretty">
                  {t('cta_body')}
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <ChatOpenButton
                    variant="default"
                    className="bg-background text-foreground hover:bg-background/90 w-full shadow-lg sm:w-auto"
                  >
                    {t('cta_secondary')}
                  </ChatOpenButton>
                  <Button
                    asChild
                    variant="outline"
                    size="xl"
                    className="text-primary-foreground hover:text-primary-foreground w-full border-white/70 bg-white/15 hover:bg-white/10 sm:w-auto"
                  >
                    <Link href="/calculator">{t('cta_primary')}</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </Reveal>
    </main>
  );
}
