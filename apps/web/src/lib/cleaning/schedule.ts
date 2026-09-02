import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { priceTurnover } from './price';
import { santiagoToday } from '@/lib/checkin/window';

export async function suggestCleaningsFromCheckouts(
  propertyId: string,
): Promise<{ suggested: number }> {
  const supabase = createSupabaseServiceRoleClient();
  const today = santiagoToday();
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
