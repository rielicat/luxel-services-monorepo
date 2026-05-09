import { NextResponse } from 'next/server';
import { getMercadoPago } from '@/lib/payments/mercadopago';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * MercadoPago IPN webhook.
 *
 * MP signs payloads via `x-signature` header (HMAC SHA256 of "id:<id>;request-id:<reqId>;ts:<ts>;").
 * Configure MERCADOPAGO_WEBHOOK_SECRET in env to enable verification — if unset, we accept the
 * payload (useful for local sandbox).
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? url.searchParams.get('data.id');
  const topic = url.searchParams.get('topic') ?? url.searchParams.get('type');

  const body = await req.text();
  let payload: { data?: { id?: string }; type?: string } = {};
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    /* topic-only notifications can have empty body */
  }

  // Verify signature if a secret is configured.
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (secret) {
    const ok = await verifyMpSignature(req, secret, id ?? payload.data?.id ?? '');
    if (!ok) return new NextResponse('Invalid signature', { status: 401 });
  }

  const paymentId = payload.data?.id ?? id;
  const eventType = payload.type ?? topic ?? 'unknown';
  if (!paymentId) return NextResponse.json({ ok: true, skipped: 'no_payment_id' });

  const supabase = createSupabaseServiceRoleClient();

  // Idempotency.
  const { error: dupErr } = await supabase.from('payment_events').insert({
    provider: 'mercadopago',
    event_id: String(paymentId),
    event_type: eventType,
    payload: { ...payload, raw_body: body },
  });
  if (dupErr && !dupErr.message.includes('duplicate')) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (dupErr) return NextResponse.json({ ok: true, deduplicated: true });

  if (eventType === 'payment') {
    const { payment } = getMercadoPago();
    const detail = await payment.get({ id: String(paymentId) });
    const externalRef = detail.external_reference; // booking id
    if (externalRef && detail.status === 'approved') {
      await supabase
        .from('bookings')
        .update({
          payment_status: 'paid',
          status: 'confirmed',
          provider_payment_id: String(paymentId),
        })
        .eq('id', externalRef);
    } else if (externalRef && detail.status === 'refunded') {
      await supabase
        .from('bookings')
        .update({ payment_status: 'refunded' })
        .eq('id', externalRef);
    }
  }

  return NextResponse.json({ ok: true });
}

async function verifyMpSignature(req: Request, secret: string, dataId: string): Promise<boolean> {
  const sigHeader = req.headers.get('x-signature');
  const requestId = req.headers.get('x-request-id');
  if (!sigHeader || !requestId) return false;

  const parts = Object.fromEntries(sigHeader.split(',').map((s) => s.trim().split('=', 2))) as {
    ts?: string;
    v1?: string;
  };
  if (!parts.ts || !parts.v1) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');

  if (expected.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}
