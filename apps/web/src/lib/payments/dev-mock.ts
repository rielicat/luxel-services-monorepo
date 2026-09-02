import 'server-only';
import type { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { capture } from '@/lib/analytics/server';
import { EVENTS } from '@/lib/analytics/events';
import { ensureSubscriptionForBooking } from '@/lib/subscriptions';

type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;
type Provider = 'stripe' | 'mercadopago' | 'transbank';

export function devMockPaymentsEnabled(provider: Provider): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.LUXEL_DEV_MOCK_PAYMENTS !== '1') return false;
  const hasRealKey =
    provider === 'stripe'
      ? Boolean(process.env.STRIPE_SECRET_KEY)
      : provider === 'mercadopago'
        ? Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN)
        : Boolean(process.env.TRANSBANK_API_KEY);
  return !hasRealKey;
}

export async function completeMockPayment(
  supabase: ServiceClient,
  bookingId: string,
  provider: Provider,
): Promise<void> {
  const { data: updated } = await supabase
    .from('bookings')
    .update({
      payment_status: 'paid',
      status: 'confirmed',
      payment_provider: provider,
      provider_payment_id: `dev_mock_${bookingId.slice(0, 8)}`,
    })
    .eq('id', bookingId)
    .select('total_price_clp, customers(clerk_user_id)')
    .maybeSingle();

  const cust = Array.isArray(updated?.customers) ? updated.customers[0] : updated?.customers;
  capture(EVENTS.PAYMENT_SUCCEEDED, cust?.clerk_user_id ?? bookingId, {
    booking_id: bookingId,
    amount_clp: updated?.total_price_clp,
    payment_provider: provider,
    mock: true,
  });

  await ensureSubscriptionForBooking(supabase, bookingId);
}
