import { after } from 'next/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { handleInboundMessage } from '@/lib/channels/pipeline';
import { encodeRef } from '@/lib/channels/types';
import { customerForListing, hospitableAccess } from '@/lib/channels/scope';
import { ingestThread, syncHospitableAccount } from '@/lib/channels/hospitable-sync';
import { authorizeWebhook } from '@/lib/channels/webhook-auth';
import { devMockEnabled } from '@/lib/dev-mock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Inbound channel events — the PRIMARY path, with the scheduled reconcile as a
 * backstop rather than the mechanism.
 *
 * Hospitable v2 fires `reservation.created`, `reservation.changed`,
 * `property.created|changed|deleted|merged`, `message.created` and
 * `review.created`, retrying a failed delivery 5 times with backoff out to six
 * hours. Webhooks are registered in their dashboard (Apps > Webhooks) — there is
 * no API to create one — so an account with none configured still gets the
 * scheduled pass and nothing else changes for it.
 *
 * NOTHING here trusts the payload's contents. An event names a reservation or a
 * property and that is all it is read for; every value acted on is fetched back
 * from Hospitable with our own credential. That is what makes the endpoint safe
 * to expose, rather than a secret pasted into the URL — see ./webhook-auth.ts.
 */

/** Events that mean the mirror is out of date for one account. Everything here
 *  resolves to the same response: re-sync that customer, now. */
const RESYNC_ACTIONS = new Set([
  'reservation.created',
  'reservation.changed',
  'property.created',
  'property.changed',
  'property.deleted',
  'property.merged',
]);

/** A burst of events for one account collapses into a single pass. The window
 *  is short because the cost of an extra sync is a few API calls, while the
 *  cost of skipping one is a guest who never gets their check-in link — and
 *  anything this does drop is what the daily reconcile exists to catch. */
const RESYNC_DEBOUNCE_MS = 30_000;

// Defensive extraction over Hospitable's webhook envelope ({action, data}) —
// exact field names vary by event version, so accept the common shapes rather
// than declaring a type the wire is not obliged to honour.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebhookPayload = any;

/**
 * Identifiers ONLY.
 *
 * The message body, sender type and guest name are not returned, on purpose: a
 * field that does not exist cannot be trusted by accident later. Everything
 * acted on is read back from Hospitable — see the `message.created` branch.
 */
function extractHospitable(
  payload: WebhookPayload,
  action: string,
): { reservationId: string | null; propertyExternalId: string | null } {
  const d = payload?.data ?? payload ?? {};
  const msg = d.message ?? d;
  return {
    reservationId: d.reservation_id ?? d.reservation?.id ?? msg.reservation_id ?? null,
    // On a property.* event the subject IS the property, so `data.id` is the
    // listing id rather than a nested reference.
    propertyExternalId:
      d.property_id ?? d.property?.id ?? (action.startsWith('property.') ? (d.id ?? null) : null),
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

/** The listing id an event is about, resolved through the mirror when the
 *  payload only identified a reservation. */
async function resolveListingId(
  reservationId: string | null,
  propertyExternalId: string | null,
): Promise<string | null> {
  if (propertyExternalId) return propertyExternalId;
  const propertyId = await resolveProperty(reservationId, null);
  if (!propertyId) return null;
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('properties')
    .select('external_listing_id')
    .eq('id', propertyId)
    .maybeSingle();
  return (data?.external_listing_id as string | undefined) ?? null;
}

/**
 * Ack first, work after.
 *
 * Hospitable retries anything that is not a prompt 200, and a mirror pass is
 * far slower than their patience — so the response must not wait on it. Outside
 * a request scope (a handler invoked directly, as in tests) `after` has nowhere
 * to defer to, and running inline is the correct behaviour there.
 */
async function afterResponse(task: () => Promise<void>): Promise<void> {
  try {
    after(task);
  } catch {
    await task();
  }
}

/** Re-mirrors one customer's account in response to an event. Returns the
 *  reason it did not, when it did not. */
async function resyncForEvent(
  reservationId: string | null,
  propertyExternalId: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const listingId = await resolveListingId(reservationId, propertyExternalId);
  if (!listingId) return { ok: true, reason: 'unidentified' };

  // Unassigned means no tenant owns it yet. Attribution is the scheduled pass's
  // job; guessing an owner here would put a listing in the wrong account.
  const customerId = await customerForListing(listingId);
  if (!customerId) return { ok: true, reason: 'unassigned' };

  const supabase = createSupabaseServiceRoleClient();
  const { data: conn } = await supabase
    .from('channel_connections')
    .select('last_synced_at')
    .eq('customer_id', customerId)
    .eq('provider', 'hospitable')
    .maybeSingle();
  const last = conn?.last_synced_at ? Date.parse(conn.last_synced_at as string) : 0;
  if (last && Date.now() - last < RESYNC_DEBOUNCE_MS) return { ok: true, reason: 'debounced' };

  const access = await hospitableAccess(customerId);
  if (!access) return { ok: true, reason: 'no_access' };

  await afterResponse(async () => {
    try {
      await syncHospitableAccount(customerId, access.token, new Date(), access.scope);
    } catch {
      // The daily reconcile is the retry. Throwing here would only make
      // Hospitable redeliver an event we already accepted.
    }
  });
  return { ok: true, reason: 'syncing' };
}

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
    // Header secret or Hospitable's published source range — never a secret in
    // the URL, which a query string would write into every access log.
    const auth = authorizeWebhook(req.headers);
    if (!auth.ok) {
      // Loud, because the realistic cause is their sender range moving, and the
      // symptom would otherwise be "events quietly stopped" until someone
      // noticed the mirror was a day stale.
      console.warn('webhook.rejected', { provider, ip: auth.ip });
      return new Response('Unauthorized', { status: 401 });
    }

    const payload = await req.json().catch(() => null);
    if (!payload) return Response.json({ ok: false }, { status: 400 });

    const action = String(payload?.action ?? '');
    const ev = extractHospitable(payload, action);

    if (RESYNC_ACTIONS.has(action)) {
      const r = await resyncForEvent(ev.reservationId, ev.propertyExternalId);
      return Response.json({ ok: r.ok, action, resync: r.reason });
    }

    if (action !== 'message.created' || !ev.reservationId) {
      return Response.json({ ok: true, ignored: true });
    }

    // The payload's body, sender and guest name are deliberately UNUSED. Acting
    // on them would let anyone who reaches this endpoint put words in a guest's
    // mouth: the AI answers in the real Airbnb thread, and the invented message
    // is stored and replayed as grounding to every later guest of the property.
    // The event tells us which thread changed; Hospitable tells us what it says.
    const propertyId = await resolveProperty(ev.reservationId, ev.propertyExternalId);
    if (!propertyId) return Response.json({ ok: true, ignored: true, reason: 'unmapped' });

    const listingId = await resolveListingId(ev.reservationId, ev.propertyExternalId);
    const customerId = listingId ? await customerForListing(listingId) : null;
    if (!customerId) return Response.json({ ok: true, ignored: true, reason: 'unassigned' });

    const access = await hospitableAccess(customerId);
    if (!access) return Response.json({ ok: true, ignored: true, reason: 'no_access' });

    const supabase = createSupabaseServiceRoleClient();
    const { data: conn } = await supabase
      .from('channel_connections')
      .select('messages_synced_at')
      .eq('customer_id', customerId)
      .eq('provider', 'hospitable')
      .maybeSingle();
    // Same watermark the scheduled pass uses: null means this account has never
    // synced, so its history imports silently instead of the AI answering
    // threads that went cold months ago.
    const watermark = (conn?.messages_synced_at as string | null) ?? null;

    const reservationId = ev.reservationId;
    await afterResponse(async () => {
      try {
        await ingestThread(supabase, access.token, propertyId, reservationId, watermark);
      } catch {
        // The daily reconcile is the retry.
      }
    });
    return Response.json({ ok: true, action, ingesting: true });
  }

  return new Response('Unknown provider', { status: 404 });
}
