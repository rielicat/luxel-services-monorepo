import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { devMockPaymentsEnabled, completeMockPayment } from '@/lib/payments/dev-mock';
import { createWebpayTransaction } from '@/lib/payments/transbank';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.redirect(new URL('/', req.url));

  const url = new URL(req.url);
  const bookingId = url.searchParams.get('bookingId');
  if (!bookingId) return NextResponse.json({ error: 'missing bookingId' }, { status: 400 });

  const supabase = createSupabaseServiceRoleClient();
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, total_price_clp, customer_id, customers(clerk_user_id)')
    .eq('id', bookingId)
    .single();

  const customer = Array.isArray(booking?.customers) ? booking.customers[0] : booking?.customers;
  if (!booking || customer?.clerk_user_id !== userId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const origin = url.origin;

  if (devMockPaymentsEnabled('transbank')) {
    await completeMockPayment(supabase, booking.id, 'transbank');
    return NextResponse.redirect(new URL('/es/account?paid=1&mock=1', origin));
  }

  const buyOrder = `LX${booking.id.replace(/-/g, '').slice(0, 24)}`;
  const tx = await createWebpayTransaction({
    buyOrder,
    sessionId: booking.id,
    amount: booking.total_price_clp,
    returnUrl: `${origin}/api/checkout/transbank/commit`,
  });

  await supabase
    .from('bookings')
    .update({ provider_session_id: tx.token, payment_provider: 'transbank' })
    .eq('id', booking.id);

  return NextResponse.redirect(`${tx.url}?token_ws=${tx.token}`);
}
