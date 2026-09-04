import type { Metadata, Viewport } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import { checkinMessages, type GuestLocale } from '@luxel/shared/i18n';
import { createSupabaseServiceRoleClient } from '@luxel/core/supabase/server';
import { CheckinForm, type RegisteredGuest } from './checkin-form';
import { resolveGuestLang } from '@luxel/core/checkin/lang';
import { findCheckin } from '@luxel/core/checkin/resolve';
import { MAX_PARTY, guestSlots } from '@luxel/core/checkin/slots';
import { santiagoToday } from '@luxel/core/checkin/window';
import { readCheckinDraft } from '@luxel/core/checkin/draft';

export const dynamic = 'force-dynamic';

export const viewport: Viewport = { interactiveWidget: 'resizes-content' };

const COLUMNS =
  'id, status, property_id, arrival_date, departure_date, revoked_at, guest_language, expected_guests, arrival_time, departure_time';

const loadCheckin = cache(async (id: string) =>
  findCheckin(createSupabaseServiceRoleClient(), id, COLUMNS),
);

async function guestLang(checkin: Record<string, unknown> | null): Promise<GuestLocale> {
  return resolveGuestLang(
    (checkin?.guest_language as string | null) ?? null,
    (await headers()).get('accept-language'),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const lang = await guestLang(await loadCheckin(id));
  const t = createTranslator({
    locale: lang,
    messages: checkinMessages(lang),
    namespace: 'checkin',
  });
  return { title: t('meta_title'), robots: { index: false, follow: false } };
}

type HouseRules = {
  pets_allowed?: boolean | null;
  smoking_allowed?: boolean | null;
  events_allowed?: boolean | null;
} | null;

export default async function CheckinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createSupabaseServiceRoleClient();

  const checkin = await loadCheckin(id);
  if (!checkin || checkin.revoked_at) notFound();

  const done = checkin.status !== 'pending';
  const departed =
    Boolean(checkin.departure_date) && santiagoToday() > (checkin.departure_date as string);

  const [{ data: property }, guestsRes, draft] = await Promise.all([
    supabase
      .from('properties')
      .select(
        'nickname, address, comuna, checkin_time, checkout_time, house_rules, listing_details, max_guests',
      )
      .eq('id', checkin.property_id as string)
      .maybeSingle(),
    done
      ? supabase
          .from('checkin_guests')
          .select('is_lead, full_name, doc_type, doc_last4')
          .eq('checkin_id', checkin.id as string)
          .order('is_lead', { ascending: false })
          .order('created_at', { ascending: true })
      : null,
    done || departed ? null : readCheckinDraft(supabase, checkin.id as string),
  ]);

  const lang = await guestLang(checkin);

  const rules = (property?.house_rules ?? null) as HouseRules;
  const listing = (property?.listing_details ?? null) as {
    additional_rules?: string | null;
  } | null;
  const houseRuleLines = (listing?.additional_rules ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);
  const maxGuests = Math.min(Math.max(property?.max_guests ?? MAX_PARTY, 1), MAX_PARTY);
  const registered: RegisteredGuest[] = (guestsRes?.data ?? []).map((g) => ({
    isLead: Boolean(g.is_lead),
    fullName: g.full_name as string,
    docType: (g.doc_type as string | null) ?? null,
    docLast4: (g.doc_last4 as string | null) ?? null,
  }));

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
            id={id}
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
            askCount={checkin.expected_guests == null}
            rules={{
              noSmoking: rules?.smoking_allowed === false,
              noPets: rules?.pets_allowed === false,
              noEvents: rules?.events_allowed === false,
              lines: houseRuleLines,
            }}
            registered={registered}
            draft={draft}
            arrivalTime={(checkin.arrival_time as string | null) ?? null}
            departureTime={(checkin.departure_time as string | null) ?? null}
          />
        </main>
      </div>
    </NextIntlClientProvider>
  );
}
