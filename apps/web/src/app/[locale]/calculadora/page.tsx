import { getTranslations } from 'next-intl/server';
import { CalculatorForm } from './calculator-form';
import { getPricingData } from '@/lib/pricing-data';
import { getComunasSantiago } from '@/lib/comunas';

export default async function CalculadoraPage() {
  const t = await getTranslations('calculator');
  const [{ serviceTypes }, comunas] = await Promise.all([getPricingData(), getComunasSantiago()]);

  return (
    <main className="container py-12">
      <header className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('title')}</h1>
        <p className="text-muted-foreground mt-3">{t('subtitle')}</p>
      </header>
      <div className="mx-auto mt-10 max-w-5xl">
        <CalculatorForm serviceTypes={serviceTypes} comunas={comunas} />
      </div>
    </main>
  );
}
