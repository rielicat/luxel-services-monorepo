'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { OutOfServiceAreaError, quote } from '@luxel/pricing';
import { getOrCreateCustomer } from '@/lib/customer';
import { getPricingData } from '@/lib/pricing-data';
import { geocodeAddress } from '@/lib/geocode';
import { getDayAvailability } from '@/lib/availability';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { capture } from '@/lib/analytics/server';
import { EVENTS } from '@/lib/analytics/events';

const Schema = z.object({
  // id or slug — fallback pricing data identifies service types by slug.
  serviceTypeId: z.string().min(1),
  squareMeters: z.coerce.number().int().positive().max(2000),
  addressLine: z.string().min(3).max(200),
  commune: z.string().min(2).max(80),
  toolsProvidedBy: z.enum(['customer', 'company']),
  frequency: z.enum(['one_time', 'weekly', 'biweekly', 'monthly']),
  scheduledDate: z.string().date(),
  timeblock: z.enum(['manana', 'tarde']),
  paymentProvider: z.enum(['stripe', 'mercadopago']),
  notes: z.string().max(500).optional(),
});

export interface CreateBookingResult {
  ok: boolean;
  error?:
    | 'unauthorized'
    | 'validation'
    | 'geocode_failed'
    | 'out_of_area'
    | 'no_availability'
    | 'service_not_found'
    | 'generic';
  bookingId?: string;
  checkoutUrl?: string;
}

export async function createBookingAction(formData: FormData): Promise<CreateBookingResult> {
  const customer = await getOrCreateCustomer();
  if (!customer) return { ok: false, error: 'unauthorized' };

  const parsed = Schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: 'validation' };
  const input = parsed.data;

  // Geocode address.
  const geocoded = await geocodeAddress(input.addressLine, input.commune);
  if (!geocoded) return { ok: false, error: 'geocode_failed' };

  const { pricingConfig, serviceTypes, operationPoints } = await getPricingData();
  const serviceType = serviceTypes.find((s) => s.id === input.serviceTypeId);
  if (!serviceType) return { ok: false, error: 'service_not_found' };

  // Quote (re-derive on the server, never trust the client total).
  let priced;
  try {
    priced = quote({
      serviceType,
      operationPoints,
      squareMeters: input.squareMeters,
      customerLat: geocoded.lat,
      customerLng: geocoded.lng,
      toolsProvidedBy: input.toolsProvidedBy,
      frequency: input.frequency,
      config: pricingConfig,
    });
  } catch (e) {
    if (e instanceof OutOfServiceAreaError) return { ok: false, error: 'out_of_area' };
    return { ok: false, error: 'generic' };
  }

  // Capacity check.
  const availability = await getDayAvailability(input.scheduledDate, priced.operationPointId);
  const slot = availability.timeblocks.find((b) => b.timeblock === input.timeblock);
  if (!slot || slot.available <= 0) return { ok: false, error: 'no_availability' };

  const supabase = createSupabaseServiceRoleClient();

  // Persist address.
  const { data: address, error: addrErr } = await supabase
    .from('addresses')
    .insert({
      customer_id: customer.id,
      line: input.addressLine,
      commune: input.commune,
      lat: geocoded.lat,
      lng: geocoded.lng,
    })
    .select('id')
    .single();
  if (addrErr || !address) return { ok: false, error: 'generic' };

  // Persist booking.
  const { data: booking, error: bookErr } = await supabase
    .from('bookings')
    .insert({
      customer_id: customer.id,
      address_id: address.id,
      service_type_id: serviceType.id,
      operation_point_id: priced.operationPointId,
      scheduled_date: input.scheduledDate,
      timeblock: input.timeblock,
      square_meters: input.squareMeters,
      tools_provided_by: input.toolsProvidedBy,
      frequency: input.frequency,
      total_price_clp: priced.totalClp,
      payment_provider: input.paymentProvider,
      payment_status: 'unpaid',
      notes: input.notes ?? null,
    })
    .select('id')
    .single();
  if (bookErr || !booking) return { ok: false, error: 'generic' };

  capture(EVENTS.BOOKING_CREATED, customer.clerk_user_id, {
    booking_id: booking.id,
    amount_clp: priced.totalClp,
    service_slug: serviceType.slug,
    frequency: input.frequency,
    square_meters: input.squareMeters,
    tools_provided_by: input.toolsProvidedBy,
    payment_provider: input.paymentProvider,
    commune: input.commune,
  });
  capture(EVENTS.CHECKOUT_STARTED, customer.clerk_user_id, {
    booking_id: booking.id,
    amount_clp: priced.totalClp,
    payment_provider: input.paymentProvider,
  });

  revalidatePath('/account', 'page');

  // Hand off to checkout.
  const checkoutPath =
    input.paymentProvider === 'stripe'
      ? `/api/checkout/stripe?bookingId=${booking.id}`
      : `/api/checkout/mercadopago?bookingId=${booking.id}`;
  redirect(checkoutPath);
}
