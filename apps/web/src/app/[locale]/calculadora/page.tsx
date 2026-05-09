import { getTranslations } from 'next-intl/server';
import { CalculatorForm } from './calculator-form';
import { getPricingData } from '@/lib/pricing-data';

export default async function CalculadoraPage() {
  const t = await getTranslations('calculator');
  const { serviceTypes } = await getPricingData();

  return (
    <main className="container py-12">
      <header className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('title')}</h1>
        <p className="mt-3 text-muted-foreground">{t('subtitle')}</p>
      </header>
      <div className="mx-auto mt-10 max-w-5xl">
        <CalculatorForm serviceTypes={serviceTypes} />
      </div>
    </main>
  );
}
