import { notFound } from 'next/navigation';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { CheckinForm } from './checkin-form';

export const dynamic = 'force-dynamic';

export default async function CheckinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createSupabaseServiceRoleClient();

  const { data: checkin } = await supabase
    .from('checkins')
    .select('id, status, property_id')
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
      .select('require_id')
      .eq('property_id', checkin.property_id)
      .maybeSingle(),
  ]);

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <CheckinForm
        token={token}
        propertyName={property?.nickname ?? ''}
        requireId={Boolean(access?.require_id)}
        alreadyDone={checkin.status !== 'pending'}
      />
    </main>
  );
}
