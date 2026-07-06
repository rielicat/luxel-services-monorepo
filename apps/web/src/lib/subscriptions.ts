import 'server-only';
import type { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { capture } from '@/lib/analytics/server';
import { EVENTS } from '@/lib/analytics/events';

type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

/**
 * Promotes a paid recurring booking into a subscription. The schema models a
 * subscription as the parent of its visit bookings (bookings.subscription_id),
 * so the first paid visit of a plan is what brings the subscription into being.
 *
 * Called from the payment-confirmation paths (provider webhooks + the dev mock)
 * rather than at booking time, so an abandoned checkout never leaves a dangling
 * "active" plan on the account.
 *
 * Idempotent under duplicate/concurrent delivery: bails when the booking is
 * one-time or already linked, and — because those in-app checks lose a race — a
 * unique index on subscriptions.origin_booking_id makes a second insert fail,
 * which we treat as "already created" rather than an error. This also makes the
 * call safe to retry (see backfillSubscriptionsForCustomer).
 */
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
  if (!booking.payment_provider) return; // subscriptions.payment_provider is NOT NULL

  // scheduled_date is a pure calendar date; take the weekday in UTC to match how
  // the account page renders these dates.
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
      // The booking total was already quoted with this frequency's discount, so
      // it is the per-visit amount of the plan.
      amount_per_visit_clp: booking.total_price_clp,
      status: 'active',
      payment_provider: booking.payment_provider,
    })
    .select('id')
    .single();

  if (error || !subscription) {
    // A unique-violation means a concurrent/duplicate delivery already created the
    // subscription for this booking — make sure the visit is linked, then bail.
    if (error && (error.code === '23505' || error.message.includes('duplicate'))) {
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('origin_booking_id', booking.id)
        .maybeSingle();
      if (existing) await linkBookingToSubscription(supabase, booking.id, existing.id);
      return;
    }
    // Anything else is unexpected: surface it so a paid-but-plan-less booking is
    // diagnosable (a later account view will retry via the backfill).
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

/** Links a visit to its plan. The `is null` guard keeps concurrent callers from
 *  clobbering an existing link. */
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

/**
 * Reconciles any paid recurring bookings that never got their subscription — the
 * provider webhook commits its idempotency-ledger row before creating the
 * subscription, so a transient failure after that point would otherwise leave the
 * plan permanently missing with no retry. Runs on account load; a no-op once every
 * plan is linked, and idempotent thanks to the origin-booking unique index.
 */
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
