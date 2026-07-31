import { notFound } from 'next/navigation';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { CheckinForm } from './checkin-form';
import { ACCESS_COLUMNS, shapeAccess } from '@/lib/checkin/access';

export const dynamic = 'force-dynamic';

export default async function CheckinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createSupabaseServiceRoleClient();

  const { data: checkin } = await supabase
    .from('checkins')
    .select('id, status, property_id, arrival_date, departure_date, revoked_at')
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

  const done = checkin.status !== 'pending';
  const requireId = Boolean(access?.require_id);
  const todaySantiago = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
  }).format(new Date());

  // A link with NO departure date can never age out, which would make it a
  // permanent door-code viewer — legacy rows and operator debug links have
  // none, so absent means expired, not immortal. A cancelled reservation is
  // revoked outright even after check-in: the row is kept for compliance, and
  // retention must not mean the link still works.
  const live =
    !checkin.revoked_at &&
    Boolean(checkin.departure_date) &&
    todaySantiago <= (checkin.departure_date as string);

  // Two ways to see the access, both behind the unguessable token:
  //  - the guest checked in, and returns to the link (it used to exist only in
  //    the browser session that submitted the form, so closing the tab lost it);
  //  - the stay has started and the host does not require identity documents,
  //    so a guest who never filled the form still gets through the door. When
  //    the host DOES require documents they declared a legal basis for it, and
  //    the form stays mandatory.
  const started =
    Boolean(checkin.arrival_date) && todaySantiago >= (checkin.arrival_date as string);
  const mayReveal = live && (done || (started && !requireId));

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <CheckinForm
        token={token}
        propertyName={property?.nickname ?? ''}
        requireId={requireId}
        alreadyDone={done}
        access={mayReveal ? shapeAccess(access) : null}
      />
    </main>
  );
}
