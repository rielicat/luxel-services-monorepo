import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { handleInboundMessage } from '@/lib/channels/pipeline';
import { encodeRef } from '@/lib/channels/types';
import { devMockEnabled } from '@/lib/dev-mock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Defensive extraction over Hospitable's webhook envelope ({action, data}) —
// exact field names vary by event version, so accept the common shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractHospitable(payload: any): {
  reservationId: string | null;
  propertyExternalId: string | null;
  body: string | null;
  senderType: string | null;
  messageId: string | null;
  guestName: string | null;
} {
  const d = payload?.data ?? payload ?? {};
  const msg = d.message ?? d;
  return {
    reservationId: d.reservation_id ?? d.reservation?.id ?? msg.reservation_id ?? null,
    propertyExternalId: d.property_id ?? d.property?.id ?? null,
    body: typeof msg.body === 'string' ? msg.body : null,
    senderType: msg.sender_type ?? null,
    messageId: msg.id ?? null,
    guestName: msg.sender?.first_name ?? d.guest?.first_name ?? null,
  };
}

/** Maps an external reservation/property to the Luxel property that owns it. */
async function resolveProperty(
  reservationId: string | null,
  propertyExternalId: string | null,
): Promise<string | null> {
  const supabase = createSupabaseServiceRoleClient();
  if (propertyExternalId) {
    const { data } = await supabase
      .from('properties')
      .select('id')
      .eq('external_listing_id', propertyExternalId)
      .maybeSingle();
    if (data) return data.id as string;
  }
  if (reservationId) {
    const { data: t } = await supabase
      .from('guest_threads')
      .select('property_id')
      .eq('channel', 'hospitable')
      .eq('external_thread_id', reservationId)
      .maybeSingle();
    if (t) return t.property_id as string;
    const { data: b } = await supabase
      .from('calendar_blocks')
      .select('property_id')
      .eq('external_uid', encodeRef({ provider: 'hospitable', id: reservationId }))
      .maybeSingle();
    if (b) return b.property_id as string;
  }
  return null;
}

/** Inbound message webhook. `local` is the dev/testing channel (dev-mock only);
 *  `hospitable` ingests real webhook events when the host has configured one
 *  pointing here (polling sync covers accounts without webhooks). */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;

  if (provider === 'local') {
    if (!devMockEnabled()) return new Response('Disabled', { status: 403 });
    const body = (await req.json().catch(() => null)) as {
      propertyId?: string;
      externalThreadId?: string;
      guestName?: string;
      body?: string;
    } | null;
    if (!body?.propertyId || !body?.body) return Response.json({ ok: false }, { status: 400 });
    const r = await handleInboundMessage({
      propertyId: body.propertyId,
      channel: 'local',
      externalThreadId: body.externalThreadId ?? null,
      guestName: body.guestName ?? null,
      body: body.body,
    });
    return Response.json(r);
  }

  if (provider === 'hospitable') {
    // Shared-secret gate (set the same value in the Hospitable webhook URL).
    const secret = process.env.HOSPITABLE_WEBHOOK_SECRET;
    if (secret) {
      const given =
        new URL(req.url).searchParams.get('secret') ?? req.headers.get('x-luxel-webhook-secret');
      if (given !== secret) return new Response('Unauthorized', { status: 401 });
    }

    const payload = await req.json().catch(() => null);
    if (!payload) return Response.json({ ok: false }, { status: 400 });

    const ev = extractHospitable(payload);
    // Only guest-authored messages trigger the pipeline; everything else is a no-op ack.
    if (!ev.body || ev.senderType !== 'guest') return Response.json({ ok: true, ignored: true });

    const propertyId = await resolveProperty(ev.reservationId, ev.propertyExternalId);
    if (!propertyId) return Response.json({ ok: true, ignored: true, reason: 'unmapped' });

    const r = await handleInboundMessage({
      propertyId,
      channel: 'hospitable',
      externalThreadId: ev.reservationId,
      guestName: ev.guestName,
      body: ev.body,
      externalMessageId: ev.messageId,
    });
    return Response.json({ ok: r.ok, action: r.action });
  }

  return new Response('Unknown provider', { status: 404 });
}
