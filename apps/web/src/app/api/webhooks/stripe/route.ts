import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/payments/stripe';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return new NextResponse('missing signature', { status: 400 });

  const body = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch {
    return new NextResponse('Invalid signature', { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();

  // Idempotency: insert into payment_events; on conflict, exit early.
  const { error: dupErr } = await supabase.from('payment_events').insert({
    provider: 'stripe',
    event_id: event.id,
    event_type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });
  if (dupErr && !dupErr.message.includes('duplicate')) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (dupErr) return NextResponse.json({ ok: true, deduplicated: true });

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const bookingId = session.metadata?.bookingId;
    if (bookingId) {
      await supabase
        .from('bookings')
        .update({
          payment_status: 'paid',
          status: 'confirmed',
          provider_payment_id:
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : (session.payment_intent?.id ?? null),
        })
        .eq('id', bookingId);
    }
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    if (charge.payment_intent) {
      const piId =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent.id;
      await supabase
        .from('bookings')
        .update({ payment_status: 'refunded' })
        .eq('provider_payment_id', piId);
    }
  }

  return NextResponse.json({ ok: true });
}
