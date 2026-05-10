import 'server-only';
import { unstable_cache } from 'next/cache';
import type { PricingConfig } from '@luxel/pricing';
import type { OperationPoint, ServiceType } from '@luxel/shared';
import { createSupabasePublicClient } from '@/lib/supabase/server';

/**
 * Loads pricing config + service types + operation points from Supabase.
 * Public-read tables — uses the publishable key, no service role needed.
 * Cached for 5 minutes; admin changes appear within that window.
 */
export const getPricingData = unstable_cache(
  async () => {
    const supabase = createSupabasePublicClient();

    const [{ data: services }, { data: ops }, { data: configRows }] = await Promise.all([
      supabase.from('service_types').select('*').eq('active', true).order('base_rate_clp'),
      supabase.from('operation_points').select('*').eq('active', true),
      supabase.from('pricing_config').select('id, value_int'),
    ]);

    const config: Record<string, number> = {};
    for (const row of configRows ?? []) {
      if (row.value_int != null) config[row.id] = row.value_int;
    }

    const pricingConfig: PricingConfig = {
      toolsSurchargeClp: config['tools_surcharge_clp'] ?? 8000,
      distancePerKmClp: config['distance_per_km_clp'] ?? 400,
      subscriptionDiscountPct: {
        weekly: config['subscription_discount_pct_weekly'] ?? 15,
        biweekly: config['subscription_discount_pct_biweekly'] ?? 10,
        monthly: config['subscription_discount_pct_monthly'] ?? 5,
      },
    };

    const serviceTypes: ServiceType[] = (services ?? []).map((s) => ({
      id: s.id,
      slug: s.slug,
      nameKey: s.name_key,
      descriptionKey: s.description_key,
      baseRateClp: s.base_rate_clp,
      perM2RateClp: s.per_m2_rate_clp,
    }));

    const operationPoints: OperationPoint[] = (ops ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      lat: typeof o.lat === 'string' ? parseFloat(o.lat) : o.lat,
      lng: typeof o.lng === 'string' ? parseFloat(o.lng) : o.lng,
      serviceRadiusKm:
        typeof o.service_radius_km === 'string'
          ? parseFloat(o.service_radius_km)
          : o.service_radius_km,
      active: o.active,
    }));

    return { pricingConfig, serviceTypes, operationPoints };
  },
  ['pricing-data'],
  { revalidate: 300, tags: ['pricing-data'] },
);
