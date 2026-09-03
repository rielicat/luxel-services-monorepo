import { after } from 'next/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { handleInboundMessage } from '@/lib/channels/pipeline';
import { encodeRef } from '@/lib/channels/types';
import { customerForListing } from '@/lib/channels/scope';
import { ingestThread, mirrorCheckinForReservation } from '@/lib/channels/hospitable-sync';
import { getHospitableReservation } from '@/lib/channels/hospitable';
import { channelPlugin } from '@/lib/channels/registry';
import type { ChannelPlugin } from '@/lib/channels/types';
import { authorizeWebhook } from '@/lib/channels/webhook-auth';
import { devMockEnabled } from '@/lib/dev-mock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const RESYNC_ACTIONS = new Set([
  'reservation.created',
  'reservation.changed',
  'property.created',
  'property.changed',
  'property.deleted',
  'property.merged',
]);

const RESERVATION_ACTIONS = new Set(['reservation.created', 'reservation.changed']);

const RESYNC_DEBOUNCE_MS = 30_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebhookPayload = any;

function extractHospitable(
  payload: WebhookPayload,
  action: string,
): { reservationId: string | null; propertyExternalId: string | null } {
  const d = payload?.data ?? payload ?? {};
  const msg = d.message ?? d;
  return {
    reservationId:
      d.reservation_id ??
      d.reservation?.id ??
      msg.reservation_id ??
      (action.startsWith('reservation.') ? (d.id ?? null) : null),
    propertyExternalId:
      d.property_id ?? d.property?.id ?? (action.startsWith('property.') ? (d.id ?? null) : null),
  };
}

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

async function afterResponse(task: () => Promise<void>): Promise<void> {
  try {
    after(task);
  } catch {
    await task();
  }
}

async function mirrorReservationNow(
  token: string,
  reservationId: string,
  listingId: string,
): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: prop } = await supabase
    .from('properties')
    .select('id')
    .eq('external_listing_id', listingId)
    .maybeSingle();
  if (!prop) return false;
  const reservation = await getHospitableReservation(token, reservationId);
  if (!reservation) return false;
  return mirrorCheckinForReservation(prop.id as string, reservation);
}

async function resyncForEvent(
  plugin: ChannelPlugin,
  action: string,
  reservationId: string | null,
  propertyExternalId: string | null,
): Promise<{ ok: boolean; reason?: string; mirrored?: boolean }> {
  const listingId = await resolveListingId(reservationId, propertyExternalId);
  if (!listingId) return { ok: true, reason: 'unidentified' };

  let customerId = await customerForListing(listingId);
  if (!customerId && plugin.capabilities.hasHostIdentity && plugin.autoAssign) {
    await plugin.autoAssign().catch(() => null);
    customerId = await customerForListing(listingId);
  }
  if (!customerId) return { ok: true, reason: 'unassigned' };

  const access = await plugin.access(customerId);
  if (!access) return { ok: true, reason: 'no_access' };

  const mirrored =
    reservationId && RESERVATION_ACTIONS.has(action)
      ? await mirrorReservationNow(access.token, reservationId, listingId)
      : false;

  const supabase = createSupabaseServiceRoleClient();
  const { data: conn } = await supabase
    .from('channel_connections')
    .select('last_synced_at')
    .eq('customer_id', customerId)
    .eq('provider', 'hospitable')
    .maybeSingle();
  const last = conn?.last_synced_at ? Date.parse(conn.last_synced_at as string) : 0;
  if (last && Date.now() - last < RESYNC_DEBOUNCE_MS)
    return { ok: true, reason: 'debounced', mirrored };

  await afterResponse(async () => {
    try {
      await plugin.sync(customerId, access, new Date());
    } catch {}
  });
  return { ok: true, reason: 'syncing', mirrored };
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
    const plugin = channelPlugin(provider);
    if (!plugin) return new Response('Unknown provider', { status: 404 });

    const auth = authorizeWebhook(req.headers);
    if (!auth.ok) {
      console.warn('webhook.rejected', { provider, ip: auth.ip });
      return new Response('Unauthorized', { status: 401 });
    }

    const payload = await req.json().catch(() => null);
    if (!payload) return Response.json({ ok: false }, { status: 400 });

    const action = String(payload?.action ?? '');
    const ev = extractHospitable(payload, action);

    if (RESYNC_ACTIONS.has(action)) {
      const r = await resyncForEvent(plugin, action, ev.reservationId, ev.propertyExternalId);
      return Response.json({ ok: r.ok, action, resync: r.reason, mirrored: r.mirrored ?? false });
    }

    if (action !== 'message.created' || !ev.reservationId) {
      return Response.json({ ok: true, ignored: true });
    }

    const propertyId = await resolveProperty(ev.reservationId, ev.propertyExternalId);
    if (!propertyId) return Response.json({ ok: true, ignored: true, reason: 'unmapped' });

    const listingId = await resolveListingId(ev.reservationId, ev.propertyExternalId);
    const customerId = listingId ? await customerForListing(listingId) : null;
    if (!customerId) return Response.json({ ok: true, ignored: true, reason: 'unassigned' });

    const access = await plugin.access(customerId);
    if (!access) return Response.json({ ok: true, ignored: true, reason: 'no_access' });

    const supabase = createSupabaseServiceRoleClient();
    const { data: conn } = await supabase
      .from('channel_connections')
      .select('messages_synced_at')
      .eq('customer_id', customerId)
      .eq('provider', 'hospitable')
      .maybeSingle();
    const watermark = (conn?.messages_synced_at as string | null) ?? null;

    const reservationId = ev.reservationId;
    await afterResponse(async () => {
      try {
        await ingestThread(supabase, access.token, propertyId, reservationId, watermark);
      } catch {}
    });
    return Response.json({ ok: true, action, ingesting: true });
  }

  return new Response('Unknown provider', { status: 404 });
}
