import { getTranslations } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { CalculatorForm } from './calculator-form';
import { ServicePicker } from './service-picker';
import { AirbnbQuote } from './airbnb-quote';
import { getPricingData } from '@/lib/pricing-data';

export default async function CalculadoraPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const { service } = await searchParams;
  const t = await getTranslations('calculator');

  if (service === 'airbnb') {
    return (
      <main className="container py-14 sm:py-16">
        <BackLink label={t('airbnb.back')} />
        <div className="mx-auto max-w-2xl">
          <AirbnbQuote />
        </div>
      </main>
    );
  }

  if (service === 'cleaning') {
    const { serviceTypes, pricingConfig } = await getPricingData();
    return (
      <main className="container py-14 sm:py-16">
        <BackLink label={t('airbnb.back')} />
        <header className="mx-auto max-w-2xl text-center">
          <h1 className="font-serif text-4xl font-medium tracking-tight sm:text-5xl">
            {t('title')}
          </h1>
          <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-lg">{t('subtitle')}</p>
        </header>
        <div className="mx-auto mt-12 max-w-5xl">
          <CalculatorForm serviceTypes={serviceTypes} config={pricingConfig} />
        </div>
      </main>
    );
  }

  return (
    <main className="container py-14 sm:py-16">
      <ServicePicker />
    </main>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      href="/calculator"
      className="text-muted-foreground hover:text-foreground mb-6 flex w-fit items-center gap-1.5 text-sm transition-colors"
    >
      <ArrowLeft className="h-4 w-4" /> {label}
    </Link>
  );
}
