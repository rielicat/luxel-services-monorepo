import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FeeEstimator } from './fee-estimator';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('calculator');
  return {
    title: t('meta_title'),
    description: t('subtitle'),
    alternates: { canonical: '/calculator' },
    openGraph: { title: t('meta_title'), description: t('subtitle'), url: '/calculator' },
  };
}

export default function CalculatorPage() {
  return (
    <main className="container py-14 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <FeeEstimator />
      </div>
    </main>
  );
}
