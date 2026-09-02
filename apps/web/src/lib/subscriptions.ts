import 'server-only';
import type { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { capture } from '@/lib/analytics/server';
import { EVENTS } from '@/lib/analytics/events';

type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export async function ensureSubscriptionForBooking(
  supabase: ServiceClient,
  bookingId: string,
): Promise<void> {
  const { data: booking } = await supabase
    .from('bookings')
    .select(
      'id, customer_id, address_id, service_type_id, subscription_id, frequency, square_meters, tools_provided_by, total_price_clp, payment_provider, timeblock, scheduled_date, customers(clerk_user_id)',
    )
    .eq('id', bookingId)
    .maybeSingle();

  if (!booking) return;
  if (!booking.frequency || booking.frequency === 'one_time') return;
  if (booking.subscription_id) return;
  if (!booking.payment_provider) return;

  const preferredDow = new Date(`${booking.scheduled_date}T00:00:00Z`).getUTCDay();

  const { data: subscription, error } = await supabase
    .from('subscriptions')
    .insert({
      customer_id: booking.customer_id,
      service_type_id: booking.service_type_id,
      address_id: booking.address_id,
      origin_booking_id: booking.id,
      frequency: booking.frequency,
      preferred_timeblock: booking.timeblock,
      preferred_dow: preferredDow,
      square_meters: booking.square_meters,
      tools_provided_by: booking.tools_provided_by,
      amount_per_visit_clp: booking.total_price_clp,
      status: 'active',
      payment_provider: booking.payment_provider,
    })
    .select('id')
    .single();

  if (error || !subscription) {
    if (error && (error.code === '23505' || error.message.includes('duplicate'))) {
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('origin_booking_id', booking.id)
        .maybeSingle();
      if (existing) await linkBookingToSubscription(supabase, booking.id, existing.id);
      return;
    }
    if (error) console.error('[subscriptions] insert failed for booking', bookingId, error);
    return;
  }

  await linkBookingToSubscription(supabase, booking.id, subscription.id);

  const cust = Array.isArray(booking.customers) ? booking.customers[0] : booking.customers;
  capture(EVENTS.SUBSCRIPTION_CREATED, cust?.clerk_user_id ?? bookingId, {
    subscription_id: subscription.id,
    booking_id: bookingId,
    frequency: booking.frequency,
    amount_per_visit_clp: booking.total_price_clp,
  });
}

async function linkBookingToSubscription(
  supabase: ServiceClient,
  bookingId: string,
  subscriptionId: string,
): Promise<void> {
  await supabase
    .from('bookings')
    .update({ subscription_id: subscriptionId })
    .eq('id', bookingId)
    .is('subscription_id', null);
}

export async function backfillSubscriptionsForCustomer(
  supabase: ServiceClient,
  customerId: string,
): Promise<void> {
  const { data: orphans } = await supabase
    .from('bookings')
    .select('id')
    .eq('customer_id', customerId)
    .eq('payment_status', 'paid')
    .neq('frequency', 'one_time')
    .is('subscription_id', null);

  for (const b of orphans ?? []) {
    await ensureSubscriptionForBooking(supabase, b.id);
  }
}
