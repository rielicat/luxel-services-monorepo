import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageOpenGraph } from '@/lib/seo/open-graph';
import { FeeEstimator } from './fee-estimator';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('calculator');
  const seo = await getTranslations('seo');
  return {
    title: t('meta_title'),
    description: t('subtitle'),
    alternates: { canonical: '/calculator' },
    openGraph: pageOpenGraph({
      title: t('meta_title'),
      description: t('subtitle'),
      path: '/calculator',
      siteName: seo('site_name'),
      imageAlt: seo('og_alt'),
    }),
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
