import { redirect, notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { fetchProperty } from '@/lib/host/queries';
import { listHospitableCalendar } from '@/lib/channels/hospitable';
import { hospitableAccess } from '@/lib/channels/scope';
import { priceTurnover } from '@/lib/cleaning/price';
import { devMockEnabled } from '@/lib/dev-mock';
import type { PropertyRow } from '../properties-client';
import { PropertyDetailClient, type LiveDay } from './detail-client';

export const dynamic = 'force-dynamic';

const DAY = 86_400_000;
// The host operates in Chile: "today" must be the Santiago calendar date, not
// UTC (which rolls over at 20:00–21:00 local and would drop tonight's data).
const santiagoToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
const plusDays = (d: string, n: number) =>
  new Date(new Date(`${d}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);

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
  const today = santiagoToday();
  let liveDays: LiveDay[] | null = null;
  if (property.external_listing_id) {
    // The listing id comes from `fetchProperty`, already scoped to this owner,
    // so reading its calendar through the central credential stays tenant-safe.
    const access = await hospitableAccess(customer.id);
    const token = access?.token ?? null;
    if (token) {
      const days = await listHospitableCalendar(
        token,
        property.external_listing_id,
        today,
        plusDays(today, 90),
      );
      // [] normalizes to null so every consumer treats "no data" uniformly.
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

  return (
    <PropertyDetailClient
      property={property}
      liveDays={liveDays}
      today={today}
      turnoverPrice={'priceClp' in turnover ? turnover.priceClp : null}
      showSim={devMockEnabled()}
    />
  );
}
