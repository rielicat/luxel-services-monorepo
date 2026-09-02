import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { checkinMessages, GUEST_LOCALES, type GuestLocale } from '@luxel/shared/i18n';
import { CheckinForm, type RegisteredGuest } from '../[id]/checkin-form';

export const dynamic = 'force-dynamic';

const REGISTERED: RegisteredGuest[] = [
  { isLead: true, fullName: 'María Pérez', nationality: 'CL', docType: 'rut', docLast4: '78-9' },
  {
    isLead: false,
    fullName: 'Pedro Pérez',
    nationality: 'AR',
    docType: 'passport',
    docLast4: '3456',
  },
  { isLead: false, fullName: 'Ana Souza', nationality: 'BR', docType: 'dni', docLast4: '1234' },
];

export default async function CheckinPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; state?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const sp = await searchParams;
  const lang: GuestLocale = (GUEST_LOCALES as readonly string[]).includes(sp.lang ?? '')
    ? (sp.lang as GuestLocale)
    : 'es';
  const done = sp.state === 'done';

  return (
    <NextIntlClientProvider
      locale={lang}
      messages={checkinMessages(lang)}
      timeZone="America/Santiago"
    >
      <main lang={lang} className="mx-auto w-full max-w-md px-4 pb-32 pt-6 sm:pt-10">
        <CheckinForm
          id="preview"
          requireId={false}
          alreadyDone={done}
          stay={{
            propertyName: 'JOSÉ MANUEL INFANTE 1045 - DPTO 401',
            address: 'José Manuel Infante 1045, Providencia',
            arrival: '2026-09-18',
            departure: '2026-09-20',
            checkinTime: '15:00',
            checkoutTime: '11:00',
          }}
          expectedGuests={4}
          maxGuests={6}
          rules={{ noSmoking: false, noPets: false, noEvents: true }}
          registered={done ? REGISTERED : []}
          arrivalTime={done ? '18:00' : null}
          departureTime={done ? '11:00' : null}
        />
      </main>
    </NextIntlClientProvider>
  );
}
