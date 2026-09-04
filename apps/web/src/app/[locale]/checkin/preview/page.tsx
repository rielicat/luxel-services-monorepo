import type { Viewport } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { checkinMessages, GUEST_LOCALES, type GuestLocale } from '@luxel/shared/i18n';
import type { CheckinDraft } from '@luxel/core/checkin/draft-shape';
import { CheckinForm, type RegisteredGuest } from '../[id]/checkin-form';

export const dynamic = 'force-dynamic';

export const viewport: Viewport = { interactiveWidget: 'resizes-content' };

const REGISTERED: RegisteredGuest[] = [
  { fullName: 'María Pérez', docType: 'rut', docLast4: '78-9' },
  { fullName: 'Pedro Pérez', docType: 'passport', docLast4: '3456' },
  { fullName: 'Ana Souza', docType: 'dni', docLast4: '1234' },
];

const DRAFT: CheckinDraft = {
  rev: 3,
  partySize: 4,
  guests: [
    { uid: 'g1', fullName: 'María Pérez', docType: 'rut', docNumber: '12.345.678-9' },
    { uid: 'g2', fullName: 'Pedro Pérez', docType: 'passport', docNumber: 'X1234567' },
    { uid: 'g3', fullName: '', docType: 'rut', docNumber: '' },
  ],
  arrivalTime: '18:00',
  departureTime: '11:00',
  parking: 'no',
  vehiclePlate: '',
};

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
      <div className="relative isolate">
        <div aria-hidden className="bg-aurora pointer-events-none absolute inset-0 -z-10" />
        <main
          lang={lang}
          data-checkin
          className="mx-auto w-full max-w-md px-4 pb-36 pt-6 sm:max-w-lg sm:pb-16 sm:pt-12"
        >
          <CheckinForm
            id="preview"
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
            askCount={sp.state === 'count'}
            draft={sp.state === 'resume' ? DRAFT : null}
            registered={done ? REGISTERED : []}
            arrivalTime={done ? '18:00' : null}
            departureTime={done ? '11:00' : null}
          />
        </main>
      </div>
    </NextIntlClientProvider>
  );
}
