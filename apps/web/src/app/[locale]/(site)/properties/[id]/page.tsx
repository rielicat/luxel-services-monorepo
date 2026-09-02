import { redirect, notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { fetchProperty } from '@/lib/host/queries';
import { listHospitableCalendar } from '@/lib/channels/hospitable';
import { hospitableAccess } from '@/lib/channels/scope';
import { priceTurnover } from '@/lib/cleaning/price';
import { resolvePricelabsRef } from '@/lib/pricelabs/link';
import { getPricelabsPrices } from '@/lib/pricelabs/client';
import { devMockEnabled } from '@/lib/dev-mock';
import { santiagoToday, shiftDate } from '@/lib/checkin/window';
import type { PropertyRow } from '../properties-client';
import { PropertyDetailClient, type LiveDay } from './detail-client';

export const dynamic = 'force-dynamic';

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const supabase = createSupabaseServiceRoleClient();
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('clerk_user_id', userId)
    .maybeSingle();
  if (!customer) notFound();

  const property = (await fetchProperty(customer.id, id)) as PropertyRow | null;
  if (!property) notFound();

  const today = santiagoToday();
  let liveDays: LiveDay[] | null = null;
  if (property.external_listing_id) {
    const access = await hospitableAccess(customer.id);
    const token = access?.token ?? null;
    if (token) {
      const days = await listHospitableCalendar(
        token,
        property.external_listing_id,
        today,
        shiftDate(today, 90),
      );
      if (days?.length) {
        liveDays = days.map((d) => ({
          date: d.date,
          available: d.status?.available === true,
          reserved: d.status?.reason === 'RESERVED',
          priceClp: d.price?.amount != null ? Math.round(d.price.amount / 100) : null,
          minStay: d.min_stay ?? null,
        }));
      }
    }
  }

  const turnover = await priceTurnover(id);

  let recommended: Record<string, number> | null = null;
  const plRef = await resolvePricelabsRef(customer.id, id);
  if (plRef) {
    const rows = await getPricelabsPrices(plRef, today, shiftDate(today, 90));
    if (rows?.length) {
      recommended = {};
      for (const r of rows) {
        if (r.price != null && r.price > 0) recommended[r.date] = Math.round(r.price);
      }
    }
  }

  return (
    <PropertyDetailClient
      property={property}
      liveDays={liveDays}
      today={today}
      turnoverPrice={'priceClp' in turnover ? turnover.priceClp : null}
      showSim={devMockEnabled()}
      recommended={recommended}
    />
  );
}
