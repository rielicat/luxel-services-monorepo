import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { Calculator, CalendarCheck, ShieldCheck, CreditCard, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { ServiceHero } from '@/components/sections/service-hero';
import { SectionHeading } from '@/components/sections/section-heading';
import { FeatureGrid } from '@/components/sections/feature-grid';
import { Steps } from '@/components/sections/steps';

export const metadata: Metadata = { title: 'Plan de Aseo profesional' };

const FEATURE_ICONS = [Calculator, CalendarCheck, ShieldCheck, CreditCard];
const STEPS = ['s1', 's2', 's3'] as const;

export default function CleaningServicePage() {
  const t = useTranslations('services.cleaning');
  const features = FEATURE_ICONS.map((icon, i) => ({
    icon,
    title: t(`f${i + 1}_title`),
    body: t(`f${i + 1}_body`),
  }));
  const steps = STEPS.map((key) => ({ title: t(`${key}_title`), body: t(`${key}_body`) }));

  return (
    <main>
      <ServiceHero title={t('title')} subtitle={t('subtitle')}>
        <Button asChild variant="lime" size="xl">
          <Link href="/calculator?service=cleaning">
            {t('cta_primary')} <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </ServiceHero>

      <section className="container py-6">
        <SectionHeading title={t('features_title')} />
        <FeatureGrid features={features} tone="accent" />
      </section>

      <section className="container py-16 sm:py-20">
        <SectionHeading title={t('how_title')} />
        <Steps steps={steps} tone="secondary" />
        <div className="mt-12 text-center">
          <Button asChild variant="outline" size="lg">
            <Link href="/calculator?service=cleaning">{t('cta_primary')}</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
