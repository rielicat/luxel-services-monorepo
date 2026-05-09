import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getStripe } from '@/lib/payments/stripe';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

/**
 * Creates a Stripe Checkout session for a booking and redirects.
 * Stripe in CLP: pass `currency: 'clp'` and amount as integer (no cents — CLP has no minor unit,
 * but Stripe expects unit_amount in the smallest currency unit, which for CLP is also the
 * peso itself, so the integer value passes through unchanged).
 */
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

  // Supabase types FK joins as arrays; bookings → customers is many-to-one so [0] is the row.
  const customer = Array.isArray(booking?.customers) ? booking.customers[0] : booking?.customers;
  if (!booking || customer?.clerk_user_id !== userId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const origin = url.origin;
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
    success_url: `${origin}/es/cuenta?paid=1`,
    cancel_url: `${origin}/es/cuenta?cancelled=1`,
  });

  await supabase
    .from('bookings')
    .update({ provider_session_id: session.id, payment_provider: 'stripe' })
    .eq('id', booking.id);

  return NextResponse.redirect(session.url!);
}
