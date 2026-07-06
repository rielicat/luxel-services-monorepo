import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getMercadoPago } from '@/lib/payments/mercadopago';
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

  // Dev-only: simulate a successful payment when no real MercadoPago token is set.
  if (devMockPaymentsEnabled('mercadopago')) {
    await completeMockPayment(supabase, booking.id, 'mercadopago');
    return NextResponse.redirect(new URL('/es/account?paid=1&mock=1', origin));
  }

  const { preference } = getMercadoPago();

  const created = await preference.create({
    body: {
      items: [
        {
          id: booking.id,
          title: 'Servicio Luxel',
          quantity: 1,
          unit_price: booking.total_price_clp,
          currency_id: 'CLP',
        },
      ],
      payer: { email: customer.email },
      external_reference: booking.id,
      back_urls: {
        success: `${origin}/es/account?paid=1`,
        failure: `${origin}/es/account?cancelled=1`,
        pending: `${origin}/es/account?pending=1`,
      },
      auto_return: 'approved',
      notification_url: `${origin}/api/webhooks/mercadopago`,
    },
  });

  await supabase
    .from('bookings')
    .update({ provider_session_id: created.id, payment_provider: 'mercadopago' })
    .eq('id', booking.id);

  const checkoutUrl = created.init_point ?? created.sandbox_init_point;
  if (!checkoutUrl) return NextResponse.json({ error: 'mp_failed' }, { status: 500 });

  return NextResponse.redirect(checkoutUrl);
}
