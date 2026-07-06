import 'server-only';
import { unstable_cache } from 'next/cache';
import type { PricingConfig } from '@luxel/pricing';
import type { OperationPoint, ServiceType } from '@luxel/shared';
import { createSupabasePublicClient } from '@/lib/supabase/server';

/**
 * Seed-equivalent defaults (mirror supabase/seed.sql). Used when the database
 * hasn't been provisioned/seeded yet or is unreachable, so the public quoting
 * flow works out of the box. Real rows take over as soon as they exist.
 */
const DEFAULT_SERVICE_TYPES: ServiceType[] = [
  {
    id: 'regular',
    slug: 'regular',
    nameKey: 'service.regular.name',
    descriptionKey: 'service.regular.desc',
    baseRateClp: 15000,
    perM2RateClp: 250,
  },
  {
    id: 'deep',
    slug: 'deep',
    nameKey: 'service.deep.name',
    descriptionKey: 'service.deep.desc',
    baseRateClp: 30000,
    perM2RateClp: 450,
  },
];

const DEFAULT_OPERATION_POINTS: OperationPoint[] = [
  {
    id: 'santiago-centro',
    name: 'Santiago Centro',
    slug: 'santiago-centro',
    lat: -33.4489,
    lng: -70.6693,
    serviceRadiusKm: 25,
    active: true,
  },
];

const DEFAULT_CONFIG: PricingConfig = {
  toolsSurchargeClp: 8000,
  distancePerKmClp: 400,
  subscriptionDiscountPct: { weekly: 15, biweekly: 10, monthly: 5 },
};

/**
 * Loads pricing config + service types + operation points from Supabase.
 * Public-read tables — uses the publishable key, no service role needed.
 * Cached for 5 minutes; admin changes appear within that window.
 *
 * Never throws: any Supabase failure or empty result falls back to the
 * seed-equivalent defaults so quoting stays functional.
 */
export const getPricingData = unstable_cache(
  async () => {
    let services: Record<string, unknown>[] = [];
    let ops: Record<string, unknown>[] = [];
    let configRows: { id: string; value_int: number | null }[] = [];

    try {
      const supabase = createSupabasePublicClient();
      const [servicesRes, opsRes, configRes] = await Promise.all([
        supabase.from('service_types').select('*').eq('active', true).order('base_rate_clp'),
        supabase.from('operation_points').select('*').eq('active', true),
        supabase.from('pricing_config').select('id, value_int'),
      ]);
      services = servicesRes.data ?? [];
      ops = opsRes.data ?? [];
      configRows = configRes.data ?? [];
    } catch {
      // Fall through to defaults below.
    }

    const config: Record<string, number> = {};
    for (const row of configRows) {
      if (row.value_int != null) config[row.id] = row.value_int;
    }

    const pricingConfig: PricingConfig = {
      toolsSurchargeClp: config['tools_surcharge_clp'] ?? DEFAULT_CONFIG.toolsSurchargeClp,
      distancePerKmClp: config['distance_per_km_clp'] ?? DEFAULT_CONFIG.distancePerKmClp,
      subscriptionDiscountPct: {
        weekly:
          config['subscription_discount_pct_weekly'] ??
          DEFAULT_CONFIG.subscriptionDiscountPct.weekly,
        biweekly:
          config['subscription_discount_pct_biweekly'] ??
          DEFAULT_CONFIG.subscriptionDiscountPct.biweekly,
        monthly:
          config['subscription_discount_pct_monthly'] ??
          DEFAULT_CONFIG.subscriptionDiscountPct.monthly,
      },
    };

    const mappedServices: ServiceType[] = services.map((s) => ({
      id: String(s.id),
      slug: s.slug as string,
      nameKey: s.name_key as string,
      descriptionKey: s.description_key as string,
      baseRateClp: s.base_rate_clp as number,
      perM2RateClp: s.per_m2_rate_clp as number,
    }));
    const serviceTypes = mappedServices.length ? mappedServices : DEFAULT_SERVICE_TYPES;

    const mappedOps: OperationPoint[] = ops.map((o) => ({
      id: String(o.id),
      name: o.name as string,
      slug: o.slug as string,
      lat: typeof o.lat === 'string' ? parseFloat(o.lat) : (o.lat as number),
      lng: typeof o.lng === 'string' ? parseFloat(o.lng) : (o.lng as number),
      serviceRadiusKm:
        typeof o.service_radius_km === 'string'
          ? parseFloat(o.service_radius_km)
          : (o.service_radius_km as number),
      active: o.active as boolean,
    }));
    const operationPoints = mappedOps.length ? mappedOps : DEFAULT_OPERATION_POINTS;

    return { pricingConfig, serviceTypes, operationPoints };
  },
  ['pricing-data'],
  { revalidate: 300, tags: ['pricing-data'] },
);
