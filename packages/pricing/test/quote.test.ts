import { describe, expect, it } from 'vitest';
import type { OperationPoint, ServiceType } from '@luxel/shared';
import { OutOfServiceAreaError, haversineKm, quote, type PricingConfig } from '../src';

const SANTIAGO_CENTRO: OperationPoint = {
  id: 'op-1',
  name: 'Santiago Centro',
  slug: 'santiago-centro',
  lat: -33.4489,
  lng: -70.6693,
  serviceRadiusKm: 25,
  active: true,
};

const REGULAR: ServiceType = {
  id: 'svc-1',
  slug: 'regular',
  nameKey: 'service.regular.name',
  descriptionKey: 'service.regular.desc',
  baseRateClp: 15000,
  perM2RateClp: 250,
};

const CONFIG: PricingConfig = {
  toolsSurchargeClp: 8000,
  distancePerKmClp: 400,
  subscriptionDiscountPct: { weekly: 15, biweekly: 10, monthly: 5 },
};

describe('haversineKm', () => {
  it('returns ~0 for identical points', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBeCloseTo(0);
  });

  it('computes Santiago → Valparaíso ≈ 100km', () => {
    const km = haversineKm({ lat: -33.4489, lng: -70.6693 }, { lat: -33.0472, lng: -71.6127 });
    expect(km).toBeGreaterThan(95);
    expect(km).toBeLessThan(110);
  });
});

describe('quote', () => {
  it('charges base + per_m2 + tools when company provides tools (no distance, no discount)', () => {
    const q = quote({
      serviceType: REGULAR,
      operationPoints: [SANTIAGO_CENTRO],
      squareMeters: 60,
      customerLat: SANTIAGO_CENTRO.lat,
      customerLng: SANTIAGO_CENTRO.lng,
      toolsProvidedBy: 'company',
      frequency: 'one_time',
      config: CONFIG,
    });
    expect(q.breakdown.base).toBe(15000);
    expect(q.breakdown.perM2).toBe(15000);
    expect(q.breakdown.tools).toBe(8000);
    expect(q.breakdown.subscriptionDiscount).toBe(0);
    expect(q.breakdown.distance).toBe(0);
    expect(q.totalClp).toBe(38000);
    expect(q.operationPointId).toBe('op-1');
  });

  it('applies weekly subscription discount on the subtotal', () => {
    const q = quote({
      serviceType: REGULAR,
      operationPoints: [SANTIAGO_CENTRO],
      squareMeters: 60,
      customerLat: SANTIAGO_CENTRO.lat,
      customerLng: SANTIAGO_CENTRO.lng,
      toolsProvidedBy: 'customer',
      frequency: 'weekly',
      config: CONFIG,
    });
    const subtotal =
      q.breakdown.base + q.breakdown.perM2 + q.breakdown.distance + q.breakdown.tools;
    expect(q.breakdown.subscriptionDiscount).toBe(Math.round(subtotal * 0.15));
    expect(q.totalClp).toBe(subtotal - q.breakdown.subscriptionDiscount);
  });

  it('chooses the nearest active operation point', () => {
    const REMOTE: OperationPoint = {
      ...SANTIAGO_CENTRO,
      id: 'op-2',
      slug: 'remote',
      lat: -33.4,
      lng: -70.5,
    };
    const q = quote({
      serviceType: REGULAR,
      operationPoints: [REMOTE, SANTIAGO_CENTRO],
      squareMeters: 50,
      customerLat: SANTIAGO_CENTRO.lat,
      customerLng: SANTIAGO_CENTRO.lng,
      toolsProvidedBy: 'customer',
      frequency: 'one_time',
      config: CONFIG,
    });
    expect(q.operationPointId).toBe('op-1');
  });

  it('skips inactive operation points', () => {
    const inactive = { ...SANTIAGO_CENTRO, active: false };
    expect(() =>
      quote({
        serviceType: REGULAR,
        operationPoints: [inactive],
        squareMeters: 50,
        customerLat: SANTIAGO_CENTRO.lat,
        customerLng: SANTIAGO_CENTRO.lng,
        toolsProvidedBy: 'customer',
        frequency: 'one_time',
        config: CONFIG,
      }),
    ).toThrow(OutOfServiceAreaError);
  });

  it('throws OutOfServiceAreaError for locations outside any radius (Punta Arenas)', () => {
    expect(() =>
      quote({
        serviceType: REGULAR,
        operationPoints: [SANTIAGO_CENTRO],
        squareMeters: 60,
        customerLat: -53.1638,
        customerLng: -70.9171,
        toolsProvidedBy: 'customer',
        frequency: 'one_time',
        config: CONFIG,
      }),
    ).toThrow(OutOfServiceAreaError);
  });
});
