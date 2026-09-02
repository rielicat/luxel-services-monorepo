import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { checkinMessages } from '@luxel/shared/i18n';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { CheckinForm, type RegisteredGuest } from './checkin-form';
import { resolveGuestLang } from '@/lib/checkin/lang';
import { MAX_PARTY, guestSlots } from '@/lib/checkin/slots';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

type HouseRules = {
  pets_allowed?: boolean | null;
  smoking_allowed?: boolean | null;
  events_allowed?: boolean | null;
} | null;

export default async function CheckinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createSupabaseServiceRoleClient();

  const { data: checkin } = await supabase
    .from('checkins')
    .select(
      'id, status, property_id, arrival_date, departure_date, revoked_at, guest_language, expected_guests, arrival_time, departure_time',
    )
    .eq('token', token)
    .maybeSingle();
  if (!checkin) notFound();

  const done = checkin.status !== 'pending';

  const [{ data: property }, { data: access }, guestsRes] = await Promise.all([
    supabase
      .from('properties')
      .select('nickname, address, comuna, checkin_time, checkout_time, house_rules, max_guests')
      .eq('id', checkin.property_id)
      .maybeSingle(),
    supabase
      .from('property_access')
      .select('require_id')
      .eq('property_id', checkin.property_id)
      .maybeSingle(),
    done
      ? supabase
          .from('checkin_guests')
          .select('is_lead, full_name, nationality, doc_type, doc_last4')
          .eq('checkin_id', checkin.id)
          .order('is_lead', { ascending: false })
          .order('created_at', { ascending: true })
      : null,
  ]);

  const lang = resolveGuestLang(
    checkin.guest_language as string | null,
    (await headers()).get('accept-language'),
  );

  const requireId = Boolean(access?.require_id);

  const rules = (property?.house_rules ?? null) as HouseRules;
  const maxGuests = Math.min(Math.max(property?.max_guests ?? MAX_PARTY, 1), MAX_PARTY);
  const registered: RegisteredGuest[] = (guestsRes?.data ?? []).map((g) => ({
    isLead: Boolean(g.is_lead),
    fullName: g.full_name as string,
    nationality: (g.nationality as string | null) ?? null,
    docType: (g.doc_type as string | null) ?? null,
    docLast4: (g.doc_last4 as string | null) ?? null,
  }));

  return (
    <NextIntlClientProvider
      locale={lang}
      messages={checkinMessages(lang)}
      timeZone="America/Santiago"
    >
      <main lang={lang} className="mx-auto w-full max-w-md px-4 pb-32 pt-6 sm:pt-10">
        <CheckinForm
          token={token}
          requireId={requireId}
          alreadyDone={done}
          stay={{
            propertyName: property?.nickname ?? '',
            address: [property?.address, property?.comuna].filter(Boolean).join(', ') || null,
            arrival: (checkin.arrival_date as string | null) ?? null,
            departure: (checkin.departure_date as string | null) ?? null,
            checkinTime: (property?.checkin_time as string | null) ?? null,
            checkoutTime: (property?.checkout_time as string | null) ?? null,
          }}
          expectedGuests={guestSlots(checkin.expected_guests as number | null, maxGuests)}
          maxGuests={maxGuests}
          rules={{
            noSmoking: rules?.smoking_allowed === false,
            noPets: rules?.pets_allowed === false,
            noEvents: rules?.events_allowed === false,
          }}
          registered={registered}
          arrivalTime={(checkin.arrival_time as string | null) ?? null}
          departureTime={(checkin.departure_time as string | null) ?? null}
        />
      </main>
    </NextIntlClientProvider>
  );
}
