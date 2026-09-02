import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PlanComparison } from './plan-comparison';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('calculator');
  return { title: t('meta_title') };
}

export default function CalculatorPage() {
  return (
    <main className="container py-14 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <PlanComparison />
      </div>
    </main>
  );
}
