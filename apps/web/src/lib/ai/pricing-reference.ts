import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { santiagoToday, shiftDate } from '@/lib/checkin/window';

export const MIN_COMPARABLE_LISTINGS = 3;
export const REFERENCE_WINDOW_DAYS = 180;
export const BEDROOM_TOLERANCE = 1;

const MAX_SCANNED_PROPERTIES = 500;

export interface ComparableQuery {
  comuna?: string | null;
  bedrooms?: number | null;
}

export interface ComparableStay {
  propertyId: string;
  nights: number | null;
  hostRevenueClp: number | null;
}

export type MarketReference =
  | { ok: false; reason: 'small_sample' }
  | {
      ok: true;
      listings: number;
      stays: number;
      nights: number;
      adrClp: number;
      occupancyPct: number;
      monthlyRevenueClp: number;
      windowDays: number;
    };

const SMALL_SAMPLE: MarketReference = { ok: false, reason: 'small_sample' };

export function normalizeComuna(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, 40) : null;
}

export function comunaMatches(candidate: unknown, wanted: string | null): boolean {
  if (!wanted) return true;
  const value = normalizeComuna(candidate);
  if (!value) return false;
  return value.includes(wanted) || wanted.includes(value);
}

export function bedroomsMatch(candidate: unknown, wanted: number | null): boolean {
  if (wanted == null) return true;
  const value = Number(candidate);
  if (!Number.isFinite(value)) return false;
  return Math.abs(value - wanted) <= BEDROOM_TOLERANCE;
}

export function summarizeComparables(
  stays: ComparableStay[],
  matchedListings: number,
  windowDays: number = REFERENCE_WINDOW_DAYS,
): MarketReference {
  if (windowDays <= 0) return SMALL_SAMPLE;
  const priced = stays.filter(
    (s) => Number(s.nights) > 0 && Number(s.hostRevenueClp) > 0 && Boolean(s.propertyId),
  );
  const sample = new Set(priced.map((s) => s.propertyId));
  if (matchedListings < MIN_COMPARABLE_LISTINGS || sample.size < MIN_COMPARABLE_LISTINGS) {
    return SMALL_SAMPLE;
  }
  const nights = priced.reduce((total, s) => total + Number(s.nights), 0);
  const revenueClp = priced.reduce((total, s) => total + Number(s.hostRevenueClp), 0);
  if (nights <= 0 || revenueClp <= 0) return SMALL_SAMPLE;
  return {
    ok: true,
    listings: sample.size,
    stays: priced.length,
    nights,
    adrClp: Math.round(revenueClp / nights),
    occupancyPct: Math.min(100, Math.round((nights / (sample.size * windowDays)) * 100)),
    monthlyRevenueClp: Math.round(revenueClp / sample.size / (windowDays / 30)),
    windowDays,
  };
}

export async function comparableMarketReference(
  query: ComparableQuery,
  now: Date = new Date(),
): Promise<MarketReference> {
  const comuna = normalizeComuna(query.comuna);
  const rawBedrooms = Number(query.bedrooms);
  const bedrooms =
    Number.isFinite(rawBedrooms) && rawBedrooms >= 0 ? Math.round(rawBedrooms) : null;

  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data: properties } = await supabase
      .from('properties')
      .select('id, comuna, bedrooms')
      .limit(MAX_SCANNED_PROPERTIES);

    const matched = (properties ?? []).filter(
      (p) => comunaMatches(p.comuna, comuna) && bedroomsMatch(p.bedrooms, bedrooms),
    );
    if (matched.length < MIN_COMPARABLE_LISTINGS) return SMALL_SAMPLE;

    const today = santiagoToday(now);
    const from = shiftDate(today, -REFERENCE_WINDOW_DAYS);
    const { data: rows } = await supabase
      .from('reservation_revenue')
      .select('property_id, nights, host_revenue_clp')
      .in(
        'property_id',
        matched.map((p) => p.id as string),
      )
      .gte('departure_date', from)
      .lt('departure_date', today);

    const stays: ComparableStay[] = (rows ?? []).map((r) => ({
      propertyId: r.property_id as string,
      nights: r.nights as number | null,
      hostRevenueClp: r.host_revenue_clp as number | null,
    }));
    return summarizeComparables(stays, matched.length);
  } catch {
    return SMALL_SAMPLE;
  }
}
