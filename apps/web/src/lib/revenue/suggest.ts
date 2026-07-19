import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

const DEFAULT_BASE_CLP = 48000; // ≈ Santiago ADR when the host hasn't set one
const HORIZON_DAYS = 30;
const DAY = 86_400_000;

export type PriceSuggestion = { date: string; price_clp: number; reason: string };
export type RevenueInsight = {
  base_clp: number;
  underbooked: number; // open nights in the next 2 weeks — discount opportunity
  occupancy_pct: number;
  suggestions: PriceSuggestion[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Market-aware-ish price suggestions from a base rate: Fri/Sat nights carry a
 * premium, near-term open nights get a last-minute discount to fill gaps. Real
 * comp data (AirDNA etc.) can refine this later; the heuristic is deterministic.
 */
export async function suggestPricing(
  propertyId: string,
  today: Date = new Date(),
): Promise<RevenueInsight> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: prop } = await supabase
    .from('properties')
    .select('base_nightly_clp')
    .eq('id', propertyId)
    .maybeSingle();
  const base = prop?.base_nightly_clp ?? DEFAULT_BASE_CLP;

  const from = iso(today);
  const to = iso(new Date(today.getTime() + HORIZON_DAYS * DAY));
  const { data: blocks } = await supabase
    .from('calendar_blocks')
    .select('starts_on, ends_on')
    .eq('property_id', propertyId)
    .lt('starts_on', to)
    .gte('ends_on', from);

  const booked = new Set<string>();
  for (const b of blocks ?? []) {
    let d = new Date(`${b.starts_on}T00:00:00Z`);
    const end = new Date(`${b.ends_on}T00:00:00Z`);
    while (d < end) {
      booked.add(iso(d));
      d = new Date(d.getTime() + DAY);
    }
  }

  const suggestions: PriceSuggestion[] = [];
  let available = 0;
  for (let i = 0; i < HORIZON_DAYS; i++) {
    const d = new Date(today.getTime() + i * DAY);
    const day = iso(d);
    if (booked.has(day)) continue;
    available++;
    const weekend = d.getUTCDay() === 5 || d.getUTCDay() === 6;
    let price = weekend ? Math.round(base * 1.15) : base;
    let reason = weekend ? 'weekend' : 'base';
    if (i <= 7) {
      price = Math.round(price * 0.9);
      reason = `${reason}+last_minute`;
    }
    suggestions.push({ date: day, price_clp: price, reason });
  }

  const twoWeeks = iso(new Date(today.getTime() + 14 * DAY));
  return {
    base_clp: base,
    underbooked: suggestions.filter((s) => s.date <= twoWeeks).length,
    occupancy_pct: Math.round(((HORIZON_DAYS - available) / HORIZON_DAYS) * 100),
    suggestions,
  };
}
