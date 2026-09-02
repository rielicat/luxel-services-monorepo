import type {
  OperationPoint,
  PriceQuote,
  ServiceFrequency,
  ServiceType,
  ToolsProvider,
} from '@luxel/shared';

export interface PricingConfig {
  toolsSurchargeClp: number;
  distancePerKmClp: number;
  subscriptionDiscountPct: Record<Exclude<ServiceFrequency, 'one_time'>, number>;
}

interface QuoteInput {
  serviceType: ServiceType;
  operationPoints: OperationPoint[];
  squareMeters: number;
  customerLat: number;
  customerLng: number;
  toolsProvidedBy: ToolsProvider;
  frequency: ServiceFrequency;
  config: PricingConfig;
}

export class OutOfServiceAreaError extends Error {
  constructor() {
    super('No active operation point covers the requested location.');
    this.name = 'OutOfServiceAreaError';
  }
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function findNearestActivePoint(
  customerLat: number,
  customerLng: number,
  points: OperationPoint[],
): { point: OperationPoint; distanceKm: number } | null {
  let best: { point: OperationPoint; distanceKm: number } | null = null;
  for (const p of points) {
    if (!p.active) continue;
    const distance = haversineKm(
      { lat: customerLat, lng: customerLng },
      { lat: p.lat, lng: p.lng },
    );
    if (distance > p.serviceRadiusKm) continue;
    if (!best || distance < best.distanceKm) best = { point: p, distanceKm: distance };
  }
  return best;
}

export function quote(input: QuoteInput): PriceQuote {
  const nearest = findNearestActivePoint(
    input.customerLat,
    input.customerLng,
    input.operationPoints,
  );
  if (!nearest) throw new OutOfServiceAreaError();

  const base = input.serviceType.baseRateClp;
  const perM2 = input.serviceType.perM2RateClp * input.squareMeters;
  const distance = Math.round(input.config.distancePerKmClp * nearest.distanceKm);
  const tools = input.toolsProvidedBy === 'company' ? input.config.toolsSurchargeClp : 0;

  const subtotal = base + perM2 + distance + tools;

  let subscriptionDiscount = 0;
  if (input.frequency !== 'one_time') {
    const pct = input.config.subscriptionDiscountPct[input.frequency];
    subscriptionDiscount = Math.round((subtotal * pct) / 100);
  }

  return {
    totalClp: subtotal - subscriptionDiscount,
    breakdown: { base, perM2, distance, tools, subscriptionDiscount },
    operationPointId: nearest.point.id,
    distanceKm: Math.round(nearest.distanceKm * 10) / 10,
  };
}
