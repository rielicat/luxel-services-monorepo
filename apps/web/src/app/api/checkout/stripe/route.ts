import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getStripe } from '@/lib/payments/stripe';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { devMockPaymentsEnabled, completeMockPayment } from '@/lib/payments/dev-mock';

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.redirect(new URL('/', req.url));

  const url = new URL(req.url);
  const bookingId = url.searchParams.get('bookingId');
  if (!bookingId) return NextResponse.json({ error: 'missing bookingId' }, { status: 400 });

  const supabase = createSupabaseServiceRoleClient();
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, total_price_clp, customer_id, customers(clerk_user_id, email)')
    .eq('id', bookingId)
    .single();

  const customer = Array.isArray(booking?.customers) ? booking.customers[0] : booking?.customers;
  if (!booking || customer?.clerk_user_id !== userId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const origin = url.origin;

  if (devMockPaymentsEnabled('stripe')) {
    await completeMockPayment(supabase, booking.id, 'stripe');
    return NextResponse.redirect(new URL('/es/account', origin));
  }

  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: customer.email,
    line_items: [
      {
        price_data: {
          currency: 'clp',
          unit_amount: booking.total_price_clp,
          product_data: { name: 'Servicio Luxel' },
        },
        quantity: 1,
      },
    ],
    metadata: { bookingId: booking.id },
    success_url: `${origin}/es/account`,
    cancel_url: `${origin}/es/account`,
  });

  await supabase
    .from('bookings')
    .update({ provider_session_id: session.id, payment_provider: 'stripe' })
    .eq('id', booking.id);

  return NextResponse.redirect(session.url!);
}
