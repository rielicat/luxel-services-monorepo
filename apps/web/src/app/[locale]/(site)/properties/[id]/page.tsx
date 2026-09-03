import { redirect, notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServiceRoleClient } from '@luxel/core/supabase/server';
import { fetchProperty } from '@luxel/core/host/queries';
import { hospitableAmountToClp, listHospitableCalendar } from '@luxel/core/channels/hospitable';
import { hospitableAccess } from '@luxel/core/channels/scope';
import { resolvePricelabsRef } from '@luxel/core/pricelabs/link';
import { getPricelabsPrices } from '@luxel/core/pricelabs/client';
import { santiagoToday, shiftDate } from '@luxel/core/checkin/window';
import { monthBounds, realizedRevenueForProperty, santiagoMonth } from '@luxel/core/revenue';
import type { PropertyRow } from '../properties-client';
import { PropertyDetailClient, type LiveDay, type MonthWindow } from './detail-client';

export const dynamic = 'force-dynamic';

function currentMonthWindow(month: string, today: string): MonthWindow {
  const bounds = monthBounds(month);
  const from = bounds?.from ?? today;
  const previous = monthBounds(shiftDate(from, -1).slice(0, 7));
  return { from, to: bounds?.to ?? shiftDate(today, 1), prevFrom: previous?.from ?? from };
}

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

  const now = new Date();
  const today = santiagoToday(now);
  const month = currentMonthWindow(santiagoMonth(now), today);
  const realized = await realizedRevenueForProperty(property.id, santiagoMonth(now), now);

  const { data: declared } = await supabase
    .from('checkins')
    .select('confirmation_code, arrival_time, departure_time')
    .eq('property_id', property.id)
    .not('confirmation_code', 'is', null)
    .gte('departure_date', today);
  const stayTimes: Record<string, { arrival: string | null; departure: string | null }> = {};
  for (const row of declared ?? []) {
    stayTimes[row.confirmation_code as string] = {
      arrival: (row.arrival_time as string | null) ?? null,
      departure: (row.departure_time as string | null) ?? null,
    };
  }
  let liveDays: LiveDay[] | null = null;
  if (property.external_listing_id) {
    const access = await hospitableAccess(customer.id);
    const token = access?.token ?? null;
    if (token) {
      const days = await listHospitableCalendar(
        token,
        property.external_listing_id,
        month.from,
        shiftDate(today, 90),
      );
      if (days?.length) {
        liveDays = days.map((d) => ({
          date: d.date,
          available: d.status?.available === true,
          reserved: d.status?.reason === 'RESERVED',
          priceClp: hospitableAmountToClp(d.price, d.price?.currency),
          minStay: d.min_stay ?? null,
        }));
      }
    }
  }

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
      realized={realized}
      stayTimes={stayTimes}
      today={today}
      month={month}
      recommended={recommended}
    />
  );
}
