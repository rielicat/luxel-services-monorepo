import { redirect, notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { fetchProperty } from '@/lib/host/queries';
import { customerHospitableToken, listHospitableCalendar } from '@/lib/channels/hospitable';
import { priceTurnover } from '@/lib/cleaning/price';
import { devMockEnabled } from '@/lib/dev-mock';
import type { PropertyRow } from '../properties-client';
import { PropertyDetailClient, type LiveDay } from './detail-client';

export const dynamic = 'force-dynamic';

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

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

  // The listing's REAL calendar for the next 90 days (published nightly prices
  // + availability), straight from the channel — nothing invented. Null on any
  // failure: the panels then fall back to the locally synced blocks.
  let liveDays: LiveDay[] | null = null;
  if (property.external_listing_id) {
    const token = await customerHospitableToken(customer.id);
    if (token) {
      const today = new Date();
      const days = await listHospitableCalendar(
        token,
        property.external_listing_id,
        iso(today),
        iso(new Date(today.getTime() + 90 * DAY)),
      );
      if (days) {
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

  return (
    <PropertyDetailClient
      property={property}
      liveDays={liveDays}
      turnoverPrice={'priceClp' in turnover ? turnover.priceClp : null}
      showSim={devMockEnabled()}
    />
  );
}
