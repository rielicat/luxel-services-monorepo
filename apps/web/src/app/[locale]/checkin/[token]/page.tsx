import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { checkinMessages } from '@luxel/shared/i18n';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { CheckinForm } from './checkin-form';
import { ACCESS_COLUMNS, shapeAccess } from '@/lib/checkin/access';
import { resolveGuestLang } from '@/lib/checkin/lang';
import { accessWindowOpen, santiagoToday } from '@/lib/checkin/window';

export const dynamic = 'force-dynamic';

export default async function CheckinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createSupabaseServiceRoleClient();

  const { data: checkin } = await supabase
    .from('checkins')
    .select('id, status, property_id, arrival_date, departure_date, revoked_at, guest_language')
    .eq('token', token)
    .maybeSingle();
  if (!checkin) notFound();

  const [{ data: property }, { data: access }] = await Promise.all([
    supabase
      .from('properties')
      .select('nickname, address')
      .eq('id', checkin.property_id)
      .maybeSingle(),
    supabase
      .from('property_access')
      .select(ACCESS_COLUMNS)
      .eq('property_id', checkin.property_id)
      .maybeSingle(),
  ]);

  // The one page on the site not in es-CL: it speaks the guest's language, as
  // Airbnb reports it, before the browser's. The site around it stays Spanish.
  const lang = resolveGuestLang(
    checkin.guest_language as string | null,
    (await headers()).get('accept-language'),
  );

  const done = checkin.status !== 'pending';
  const requireId = Boolean(access?.require_id);
  const today = santiagoToday();

  // A link with NO departure date can never age out, which would make it a
  // permanent door-code viewer — legacy rows and operator debug links have
  // none, so absent means expired, not immortal. A cancelled reservation is
  // revoked outright even after check-in: the row is kept for compliance, and
  // retention must not mean the link still works.
  const live =
    !checkin.revoked_at &&
    Boolean(checkin.departure_date) &&
    today <= (checkin.departure_date as string);

  // Access shows behind the token once the guest has checked in AND the stay is
  // inside the same window Hospitable's rule uses to send the details, so the
  // page never reveals earlier than the thread does.
  const mayReveal = live && done && accessWindowOpen(checkin.arrival_date as string | null, today);

  return (
    <NextIntlClientProvider
      locale={lang}
      messages={checkinMessages(lang)}
      timeZone="America/Santiago"
    >
      <main lang={lang} className="mx-auto max-w-lg px-4 py-10">
        <CheckinForm
          token={token}
          propertyName={property?.nickname ?? ''}
          requireId={requireId}
          alreadyDone={done}
          access={mayReveal ? shapeAccess(access) : null}
        />
      </main>
    </NextIntlClientProvider>
  );
}
