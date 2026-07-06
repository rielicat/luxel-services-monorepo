import { getTranslations } from 'next-intl/server';
import { CalculatorForm } from './calculator-form';
import { getPricingData } from '@/lib/pricing-data';

export default async function CalculadoraPage() {
  const t = await getTranslations('calculator');
  const { serviceTypes, pricingConfig } = await getPricingData();

  return (
    <main className="container py-14 sm:py-16">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="font-serif text-4xl font-medium tracking-tight sm:text-5xl">{t('title')}</h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-lg">{t('subtitle')}</p>
      </header>
      <div className="mx-auto mt-12 max-w-5xl">
        <CalculatorForm serviceTypes={serviceTypes} config={pricingConfig} />
      </div>
    </main>
  );
}
