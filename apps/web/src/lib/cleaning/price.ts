import 'server-only';
import { quote, OutOfServiceAreaError } from '@luxel/pricing';
import { getPricingData } from '@/lib/pricing-data';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

// The turnover clean maps to the standard service; Luxel provides tools, one-off.
const TURNOVER_SERVICE_SLUG = 'regular';

export type TurnoverPrice = { priceClp: number } | { error: 'no_data' | 'out_of_area' | 'service' };

/** Per-turnover cleaning price for a property, from size + distance (@luxel/pricing).
 *  The host sets this as their AirBnB cleaning fee, so the guest funds it. */
export async function priceTurnover(propertyId: string): Promise<TurnoverPrice> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: prop } = await supabase
    .from('properties')
    .select('size_m2, lat, lng')
    .eq('id', propertyId)
    .maybeSingle();
  if (!prop?.size_m2 || prop.lat == null || prop.lng == null) return { error: 'no_data' };

  try {
    const { pricingConfig, serviceTypes, operationPoints } = await getPricingData();
    const serviceType =
      serviceTypes.find((s) => s.slug === TURNOVER_SERVICE_SLUG) ?? serviceTypes[0];
    if (!serviceType) return { error: 'service' };

    const q = quote({
      serviceType,
      operationPoints,
      squareMeters: Number(prop.size_m2),
      customerLat: Number(prop.lat),
      customerLng: Number(prop.lng),
      toolsProvidedBy: 'company',
      frequency: 'one_time',
      config: pricingConfig,
    });
    return { priceClp: q.totalClp };
  } catch (e) {
    if (e instanceof OutOfServiceAreaError) return { error: 'out_of_area' };
    return { error: 'service' };
  }
}
