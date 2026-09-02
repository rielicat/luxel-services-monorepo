import { NextResponse } from 'next/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { capture } from '@/lib/analytics/server';
import { EVENTS } from '@/lib/analytics/events';
import { ensureSubscriptionForBooking } from '@/lib/subscriptions';
import { commitWebpayTransaction, isWebpayApproved } from '@/lib/payments/transbank';

export const runtime = 'nodejs';

async function handle(req: Request): Promise<NextResponse> {
  const origin = new URL(req.url).origin;
  const seeOther = () => NextResponse.redirect(new URL('/es/account', origin), 303);

  const { token, aborted } = await readToken(req);
  if (aborted || !token) return seeOther();

  const supabase = createSupabaseServiceRoleClient();
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, payment_status, total_price_clp')
    .eq('provider_session_id', token)
    .eq('payment_provider', 'transbank')
    .maybeSingle();

  if (!booking) return seeOther();
  if (booking.payment_status === 'paid') return seeOther();

  let result;
  try {
    result = await commitWebpayTransaction(token);
  } catch {
    return seeOther();
  }
  if (!isWebpayApproved(result)) return seeOther();
  if (result.amount !== booking.total_price_clp) return seeOther();

  const { data: updated } = await supabase
    .from('bookings')
    .update({
      payment_status: 'paid',
      status: 'confirmed',
      provider_payment_id: result.authorization_code ?? token,
    })
    .eq('id', booking.id)
    .eq('payment_status', 'unpaid')
    .select('total_price_clp, customers(clerk_user_id)')
    .maybeSingle();

  if (!updated) return seeOther();

  const cust = Array.isArray(updated.customers) ? updated.customers[0] : updated.customers;
  capture(EVENTS.PAYMENT_SUCCEEDED, cust?.clerk_user_id ?? booking.id, {
    booking_id: booking.id,
    amount_clp: updated?.total_price_clp,
    payment_provider: 'transbank',
  });
  await ensureSubscriptionForBooking(supabase, booking.id);

  return seeOther();
}

async function readToken(req: Request): Promise<{ token: string | null; aborted: boolean }> {
  const url = new URL(req.url);
  let token = url.searchParams.get('token_ws');
  let tbkToken = url.searchParams.get('TBK_TOKEN');
  if (req.method === 'POST') {
    try {
      const form = await req.formData();
      token = (form.get('token_ws') as string | null) ?? token;
      tbkToken = (form.get('TBK_TOKEN') as string | null) ?? tbkToken;
    } catch {}
  }
  return { token, aborted: Boolean(tbkToken) };
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
