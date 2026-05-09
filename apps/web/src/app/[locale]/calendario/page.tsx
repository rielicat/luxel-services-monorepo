import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getOrCreateCustomer } from '@/lib/customer';
import { getPricingData } from '@/lib/pricing-data';
import { CalendarView } from './calendar-view';

export default async function CalendarioPage() {
  const customer = await getOrCreateCustomer();
  if (!customer) redirect('/');

  const t = await getTranslations('calendar');
  const { operationPoints } = await getPricingData();
  const defaultPoint = operationPoints[0];
  if (!defaultPoint) {
    return (
      <main className="container py-12">
        <p className="text-sm text-muted-foreground">No hay puntos de operación configurados.</p>
      </main>
    );
  }

  return (
    <main className="container max-w-5xl py-12">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{defaultPoint.name}</p>
      <div className="mt-8">
        <CalendarView operationPointId={defaultPoint.id} />
      </div>
    </main>
  );
}
