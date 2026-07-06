import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getOrCreateCustomer } from '@/lib/customer';
import { getPricingData } from '@/lib/pricing-data';
import { BookingForm } from './booking-form';

interface Props {
  searchParams: Promise<{
    serviceTypeId?: string;
    serviceTypeSlug?: string;
    operationPointId?: string;
    frequency?: 'one_time' | 'weekly' | 'biweekly' | 'monthly';
    squareMeters?: string;
    toolsProvidedBy?: 'customer' | 'company';
    addressLine?: string;
    commune?: string;
  }>;
}

export default async function AgendarPage({ searchParams }: Props) {
  const customer = await getOrCreateCustomer();
  if (!customer) redirect('/');

  const t = await getTranslations('booking');
  const params = await searchParams;
  const { serviceTypes, operationPoints } = await getPricingData();
  const operationPointId = params.operationPointId ?? operationPoints[0]?.id;
  if (!operationPointId) {
    return (
      <main className="container py-12">
        <p className="text-muted-foreground text-sm">{t('no_ops')}</p>
      </main>
    );
  }

  // Resolve the service type from either id or slug (fallback data uses slug ids).
  const resolved =
    serviceTypes.find((s) => s.id === params.serviceTypeId) ??
    serviceTypes.find((s) => s.slug === params.serviceTypeSlug);

  return (
    <main className="container max-w-5xl py-12">
      <h1 className="font-display text-3xl font-bold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground mt-2 text-sm">{t('subtitle')}</p>
      <div className="mt-8">
        <BookingForm
          serviceTypes={serviceTypes}
          operationPointId={operationPointId}
          initial={{
            serviceTypeId: resolved?.id,
            frequency: params.frequency,
            squareMeters: params.squareMeters ? Number(params.squareMeters) : undefined,
            toolsProvidedBy: params.toolsProvidedBy,
            addressLine: params.addressLine,
            commune: params.commune,
          }}
        />
      </div>
    </main>
  );
}
