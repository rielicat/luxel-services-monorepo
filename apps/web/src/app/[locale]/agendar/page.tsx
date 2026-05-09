import { redirect } from 'next/navigation';
import { getOrCreateCustomer } from '@/lib/customer';
import { getPricingData } from '@/lib/pricing-data';
import { BookingForm } from './booking-form';

interface Props {
  searchParams: Promise<{
    serviceTypeId?: string;
    operationPointId?: string;
    frequency?: 'one_time' | 'weekly' | 'biweekly' | 'monthly';
    squareMeters?: string;
  }>;
}

export default async function AgendarPage({ searchParams }: Props) {
  const customer = await getOrCreateCustomer();
  if (!customer) redirect('/');

  const params = await searchParams;
  const { serviceTypes, operationPoints } = await getPricingData();
  const operationPointId = params.operationPointId ?? operationPoints[0]?.id;
  if (!operationPointId) {
    return (
      <main className="container py-12">
        <p className="text-muted-foreground text-sm">No hay puntos de operación configurados.</p>
      </main>
    );
  }

  return (
    <main className="container max-w-5xl py-12">
      <h1 className="text-3xl font-bold tracking-tight">Agendar servicio</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Confirma los detalles, elige tu fecha y procede al pago.
      </p>
      <div className="mt-8">
        <BookingForm
          serviceTypes={serviceTypes}
          operationPointId={operationPointId}
          initial={{
            serviceTypeId: params.serviceTypeId,
            frequency: params.frequency,
            squareMeters: params.squareMeters ? Number(params.squareMeters) : undefined,
          }}
        />
      </div>
    </main>
  );
}
