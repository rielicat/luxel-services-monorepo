import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getTranslations } from 'next-intl/server';
import { getPricingData } from '@/lib/pricing-data';
import { availablePaymentProviders } from '@/lib/payments/providers';
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
  // Gate on auth only — tolerate a missing customer row (created lazily on
  // submit) so a signed-in user is never bounced home, losing the quote/plan
  // intent in the query string. Mirrors /account's resilient behaviour.
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const t = await getTranslations('booking');
  const params = await searchParams;
  const { serviceTypes, operationPoints, pricingConfig } = await getPricingData();
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
    <main className="pb-16">
      <section className="bg-aurora border-border/50 border-b">
        <div className="container max-w-6xl py-10 sm:py-12">
          <p className="text-secondary text-sm font-semibold">{t('eyebrow')}</p>
          <h1 className="font-display mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
            {t('title')}
          </h1>
          <p className="text-muted-foreground mt-2 max-w-xl text-sm sm:text-base">
            {t('subtitle')}
          </p>
        </div>
      </section>
      <div className="container max-w-6xl pt-8">
        <BookingForm
          serviceTypes={serviceTypes}
          operationPointId={operationPointId}
          config={pricingConfig}
          paymentProviders={availablePaymentProviders()}
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
