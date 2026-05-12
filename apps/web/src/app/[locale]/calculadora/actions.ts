'use server';

import { OutOfServiceAreaError, quote } from '@luxel/pricing';
import { QuoteRequestSchema } from '@luxel/shared/schemas';
import type { PriceQuote } from '@luxel/shared';
import { getPricingData } from '@/lib/pricing-data';
import { geocodeAddress } from '@/lib/geocode';

export type QuoteErrorCode =
  | 'validation'
  | 'out_of_area'
  | 'geocode_failed'
  | 'service_not_found'
  | 'generic';

export interface QuoteActionResult {
  ok: boolean;
  quote?: PriceQuote & {
    serviceTypeId: string;
    serviceTypeSlug: string;
    serviceNameKey: string;
  };
  geocoded?: { lat: number; lng: number; displayName: string };
  error?: QuoteErrorCode;
}

export interface QuoteActionInput {
  serviceTypeSlug: string;
  squareMeters: number;
  address: string;
  commune: string;
  toolsProvidedBy: 'customer' | 'company';
  frequency: 'one_time' | 'weekly' | 'biweekly' | 'monthly';
}

export async function getQuoteAction(input: QuoteActionInput): Promise<QuoteActionResult> {
  const geocoded = await geocodeAddress(input.address, input.commune || undefined);
  if (!geocoded) return { ok: false, error: 'geocode_failed' };

  const parsed = QuoteRequestSchema.safeParse({
    serviceTypeSlug: input.serviceTypeSlug,
    squareMeters: input.squareMeters,
    lat: geocoded.lat,
    lng: geocoded.lng,
    toolsProvidedBy: input.toolsProvidedBy,
    frequency: input.frequency,
  });
  if (!parsed.success) return { ok: false, error: 'validation' };

  const { pricingConfig, serviceTypes, operationPoints } = await getPricingData();
  const serviceType = serviceTypes.find((s) => s.slug === parsed.data.serviceTypeSlug);
  if (!serviceType) return { ok: false, error: 'service_not_found' };

  try {
    const result = quote({
      serviceType,
      operationPoints,
      squareMeters: parsed.data.squareMeters,
      customerLat: parsed.data.lat,
      customerLng: parsed.data.lng,
      toolsProvidedBy: parsed.data.toolsProvidedBy,
      frequency: parsed.data.frequency,
      config: pricingConfig,
    });
    return {
      ok: true,
      quote: {
        ...result,
        serviceTypeId: serviceType.id,
        serviceTypeSlug: serviceType.slug,
        serviceNameKey: serviceType.nameKey,
      },
      geocoded,
    };
  } catch (e) {
    if (e instanceof OutOfServiceAreaError) return { ok: false, error: 'out_of_area' };
    return { ok: false, error: 'generic' };
  }
}
