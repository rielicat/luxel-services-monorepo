import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { priceTurnover } from './price';

/**
 * Suggests a cleaning for each future check-out (imported calendar block end),
 * priced by the turnover engine. Existing cleanings (any status) are left as-is,
 * so a host's scheduled/skipped decisions survive a refresh.
 */
export async function suggestCleaningsFromCheckouts(
  propertyId: string,
): Promise<{ suggested: number }> {
  const supabase = createSupabaseServiceRoleClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: blocks } = await supabase
    .from('calendar_blocks')
    .select('ends_on')
    .eq('property_id', propertyId)
    .eq('source', 'import')
    .gte('ends_on', today);
  if (!blocks?.length) return { suggested: 0 };

  const priced = await priceTurnover(propertyId);
  const price = 'priceClp' in priced ? priced.priceClp : null;

  const dates = [...new Set(blocks.map((b) => b.ends_on as string))];
  const rows = dates.map((d) => ({
    property_id: propertyId,
    cleaning_date: d,
    status: 'suggested',
    price_clp: price,
    source: 'checkout',
  }));
  const { data: inserted } = await supabase
    .from('cleanings')
    .upsert(rows, { onConflict: 'property_id,cleaning_date', ignoreDuplicates: true })
    .select('id');
  return { suggested: inserted?.length ?? 0 };
}
