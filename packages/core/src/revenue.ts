import 'server-only';
import { createSupabaseServiceRoleClient } from './supabase/server';
import { santiagoToday, shiftDate } from './checkin/window';

export interface RealizedRevenue {
  month: string;
  stays: number;
  nights: number;
  hostRevenueClp: number;
  cleaningFeeClp: number;
  commissionBaseClp: number;
  guestTotalClp: number;
  unpricedStays: number;
  unknownCleaningStays: number;
  syncedAt: string | null;
  propertiesCounted: number;
  propertiesNeverSynced: number;
}

export interface PropertyRealizedRevenue extends RealizedRevenue {
  propertyId: string;
}

export interface PortfolioRealizedRevenue extends RealizedRevenue {
  customerId: string;
  properties: PropertyRealizedRevenue[];
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function santiagoMonth(now: Date = new Date()): string {
  return santiagoToday(now).slice(0, 7);
}

export function monthBounds(month: string): { from: string; to: string } | null {
  if (!MONTH.test(month)) return null;
  const from = `${month}-01`;
  return { from, to: `${shiftDate(from, 31).slice(0, 7)}-01` };
}

interface RevenueRow {
  property_id: string;
  nights: number | null;
  host_revenue_clp: number | null;
  cleaning_fee_clp: number | null;
  guest_total_clp: number | null;
  synced_at: string | null;
}

function fold(month: string, propertyIds: string[], rows: RevenueRow[]): RealizedRevenue {
  const out: RealizedRevenue = {
    month,
    stays: 0,
    nights: 0,
    hostRevenueClp: 0,
    cleaningFeeClp: 0,
    commissionBaseClp: 0,
    guestTotalClp: 0,
    unpricedStays: 0,
    unknownCleaningStays: 0,
    syncedAt: null,
    propertiesCounted: propertyIds.length,
    propertiesNeverSynced: propertyIds.length,
  };
  const seen = new Set<string>();
  let newest = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    out.stays += 1;
    out.nights += row.nights ?? 0;
    out.hostRevenueClp += row.host_revenue_clp ?? 0;
    out.cleaningFeeClp += row.cleaning_fee_clp ?? 0;
    out.guestTotalClp += row.guest_total_clp ?? 0;
    if (row.host_revenue_clp == null) out.unpricedStays += 1;
    if (row.cleaning_fee_clp == null) out.unknownCleaningStays += 1;
    seen.add(row.property_id);
    const at = row.synced_at ? Date.parse(row.synced_at) : Number.NaN;
    if (Number.isFinite(at) && at > newest) {
      newest = at;
      out.syncedAt = row.synced_at;
    }
  }
  out.propertiesNeverSynced = propertyIds.filter((id) => !seen.has(id)).length;
  out.commissionBaseClp = Math.max(0, out.hostRevenueClp - out.cleaningFeeClp);
  return out;
}

async function realizedRows(
  propertyIds: string[],
  month: string,
  now: Date,
): Promise<RevenueRow[]> {
  const bounds = monthBounds(month);
  if (!bounds || !propertyIds.length) return [];
  const today = santiagoToday(now);
  const until = bounds.to < today ? bounds.to : today;
  if (until <= bounds.from) return [];

  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('reservation_revenue')
    .select('property_id, nights, host_revenue_clp, cleaning_fee_clp, guest_total_clp, synced_at')
    .in('property_id', propertyIds)
    .gte('departure_date', bounds.from)
    .lt('departure_date', until);
  return (data ?? []) as unknown as RevenueRow[];
}

export async function realizedRevenueForProperty(
  propertyId: string,
  month: string,
  now: Date = new Date(),
): Promise<PropertyRealizedRevenue> {
  const rows = await realizedRows([propertyId], month, now);
  return { propertyId, ...fold(month, [propertyId], rows) };
}

export async function realizedRevenueForCustomer(
  customerId: string,
  month: string,
  now: Date = new Date(),
): Promise<PortfolioRealizedRevenue> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase.from('properties').select('id').eq('owner_id', customerId);
  const propertyIds = (data ?? []).map((p) => p.id as string);
  const rows = await realizedRows(propertyIds, month, now);

  const byProperty = new Map<string, RevenueRow[]>(propertyIds.map((id) => [id, []]));
  for (const row of rows) byProperty.get(row.property_id)?.push(row);

  return {
    customerId,
    ...fold(month, propertyIds, rows),
    properties: propertyIds.map((id) => ({
      propertyId: id,
      ...fold(month, [id], byProperty.get(id) ?? []),
    })),
  };
}
