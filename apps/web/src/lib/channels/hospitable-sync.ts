import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import {
  listHospitableProperties,
  listHospitableReservations,
  listHospitableMessages,
  type HospitableProperty,
  type HospitableReservation,
} from './hospitable';
import { suggestCleaningsFromCheckouts } from '@/lib/cleaning/schedule';
import { handleInboundMessage } from './pipeline';

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface HospitableSyncResult {
  ok: boolean;
  properties: number;
  reservations: number;
  cleanings: number;
  messagesImported: number;
  aiReplies: number;
}

type Supabase = ReturnType<typeof createSupabaseServiceRoleClient>;

/** Upserts one Hospitable property into the Luxel `properties` mirror (matched by
 *  external_listing_id). New rows get a default access record. Returns the row id,
 *  or null if the insert failed. Shared by the full sync and the light reconcile. */
async function upsertHospitableProperty(
  supabase: Supabase,
  customerId: string,
  rp: HospitableProperty,
): Promise<string | null> {
  const coords = rp.address?.coordinates;
  const lat = coords?.latitude != null ? Number(coords.latitude) : null;
  const lng = coords?.longitude != null ? Number(coords.longitude) : null;

  const fields = {
    nickname: rp.public_name || rp.name || 'Propiedad Airbnb',
    address: rp.address?.street ?? null,
    comuna: rp.address?.city ?? null,
    bedrooms: rp.capacity?.bedrooms ?? null,
    bathrooms: rp.capacity?.bathrooms ?? null,
    platform: 'airbnb',
    external_listing_id: rp.id,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    picture_url: rp.picture ?? null,
    max_guests: rp.capacity?.max ?? null,
    beds: rp.capacity?.beds ?? null,
    property_type: rp.property_type ?? null,
    room_type: rp.room_type ?? null,
    checkin_time: rp.checkin ?? null,
    checkout_time: rp.checkout ?? null,
    listed: rp.listed ?? true,
    amenities: rp.amenities ?? null,
    house_rules: rp.house_rules ?? null,
    updated_at: new Date().toISOString(),
  };

  // Atomic upsert against the (owner_id, external_listing_id) unique index —
  // concurrent page loads can't race a select-then-insert into duplicates.
  const { data: row } = await supabase
    .from('properties')
    .upsert({ owner_id: customerId, ...fields }, { onConflict: 'owner_id,external_listing_id' })
    .select('id')
    .single();
  if (!row) return null;
  // Seed the default access record only if none exists (PK = property_id).
  await supabase
    .from('property_access')
    .upsert(
      { property_id: row.id as string, method: 'physical_none' },
      { onConflict: 'property_id', ignoreDuplicates: true },
    );
  return row.id as string;
}

/** Strict mirror: the properties grid IS the Hospitable account. Any local row
 *  that isn't in the remote listing set — a legacy row without an external id,
 *  or a listing removed upstream — gets deleted. Every FK in the properties
 *  subtree is ON DELETE CASCADE (see 0010–0021 migrations), so children go too.
 *  Callers only reach this after a COMPLETE remote fetch
 *  (listHospitableProperties is complete-or-nothing), and an EMPTY remote set
 *  skips pruning entirely: wiping the whole tree off one "0 listings" response
 *  is a worse failure mode than briefly showing a listing that was removed. */
async function pruneToHospitable(
  supabase: Supabase,
  customerId: string,
  remoteIds: string[],
): Promise<void> {
  if (!remoteIds.length) return;
  await supabase
    .from('properties')
    .delete()
    .eq('owner_id', customerId)
    .is('external_listing_id', null);
  await supabase
    .from('properties')
    .delete()
    .eq('owner_id', customerId)
    .not('external_listing_id', 'in', `(${remoteIds.map((id) => `"${id}"`).join(',')})`);
}

export interface HospitableReconcileResult {
  ok: boolean;
  properties: number;
  accountLabel: string | null;
}

/** Light, page-load-safe refresh: pulls ONLY the property list from Hospitable,
 *  upserts the rows and prunes everything else (strict mirror) — no
 *  reservations, messages or AI replies. Lets the /properties grid stay live on
 *  every load without the cost or side effects of a full sync (which stays on
 *  connect / the manual button / webhooks). */
export async function reconcileHospitableProperties(
  customerId: string,
  token: string,
): Promise<HospitableReconcileResult> {
  const supabase = createSupabaseServiceRoleClient();
  const remote = await listHospitableProperties(token);
  if (!remote) return { ok: false, properties: 0, accountLabel: null };
  for (const rp of remote) {
    await upsertHospitableProperty(supabase, customerId, rp);
  }
  await pruneToHospitable(
    supabase,
    customerId,
    remote.map((rp) => rp.id),
  );
  await supabase
    .from('channel_connections')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('customer_id', customerId)
    .eq('provider', 'hospitable');
  return {
    ok: true,
    properties: remote.length,
    accountLabel: remote[0]?.public_name ?? remote[0]?.name ?? null,
  };
}

/**
 * Pulls each recent/upcoming reservation's conversation. History (anything at or
 * before the connection's watermark, or everything on the first sync) is imported
 * silently — it feeds the AI's grounding. Only guest messages NEWER than the
 * watermark run through the auto-reply pipeline, so connecting an account never
 * blasts replies at old threads.
 */
async function syncConversations(
  supabase: Supabase,
  token: string,
  propertyId: string,
  reservations: HospitableReservation[],
  watermark: string | null,
  now: Date,
): Promise<{ imported: number; replies: number }> {
  let imported = 0;
  let replies = 0;
  const recentCutoff = iso(new Date(now.getTime() - 14 * DAY));
  const active = reservations.filter((r) => r.departure_date.slice(0, 10) >= recentCutoff);

  for (const r of active) {
    const messages = await listHospitableMessages(token, r.id);
    if (!messages?.length) continue;
    const guestName = messages.find((m) => m.sender_type === 'guest')?.sender?.first_name ?? null;

    // One thread per reservation; created here so history imports land somewhere.
    const { data: thread } = await supabase
      .from('guest_threads')
      .upsert(
        {
          property_id: propertyId,
          channel: 'hospitable',
          external_thread_id: r.id,
          guest_name: guestName,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'property_id,channel,external_thread_id' },
      )
      .select('id')
      .single();
    if (!thread) continue;

    const { data: existing } = await supabase
      .from('guest_messages')
      .select('external_id')
      .eq('thread_id', thread.id)
      .not('external_id', 'is', null);
    const seen = new Set((existing ?? []).map((m) => m.external_id as string));

    const ordered = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const m of ordered) {
      if (!m.body || seen.has(m.id)) continue;
      const isGuest = m.sender_type === 'guest';
      const isNew = watermark !== null && m.created_at > watermark;

      if (isGuest && isNew) {
        const res = await handleInboundMessage({
          propertyId,
          channel: 'hospitable',
          externalThreadId: r.id,
          guestName,
          body: m.body,
          externalMessageId: m.id,
        });
        if (res.action === 'sent') replies++;
        imported++;
      } else {
        await supabase.from('guest_messages').insert({
          thread_id: thread.id,
          direction: isGuest ? 'in' : 'out',
          source: isGuest ? 'guest' : 'host',
          body: m.body,
          external_id: m.id,
        });
        imported++;
      }
      seen.add(m.id);
    }
  }
  return { imported, replies };
}

/**
 * Full sync of a customer's Hospitable account into Luxel:
 *  1) properties → upsert into `properties` (matched by external_listing_id),
 *  2) accepted reservations (-60d … +400d) → `calendar_blocks` (source 'import',
 *     external_uid 'hosp:<code>', full-refresh of the hosp: namespace so
 *     cancellations disappear),
 *  3) refresh check-out-driven cleaning suggestions per property.
 * The reservation's conversation id is kept on the block summary side-table-free
 * via guest_threads.external_thread_id when messaging starts (Phase-2 pipeline).
 */
export async function syncHospitableAccount(
  customerId: string,
  token: string,
  now: Date = new Date(),
): Promise<HospitableSyncResult> {
  const supabase = createSupabaseServiceRoleClient();
  const remote = await listHospitableProperties(token);
  if (!remote)
    return {
      ok: false,
      properties: 0,
      reservations: 0,
      cleanings: 0,
      messagesImported: 0,
      aiReplies: 0,
    };

  // Watermark: null = first sync → import all history silently, no auto-replies.
  const { data: conn } = await supabase
    .from('channel_connections')
    .select('messages_synced_at')
    .eq('customer_id', customerId)
    .eq('provider', 'hospitable')
    .maybeSingle();
  const watermark = (conn?.messages_synced_at as string | null) ?? null;

  let reservationCount = 0;
  let cleaningCount = 0;
  let messagesImported = 0;
  let aiReplies = 0;

  for (const rp of remote) {
    // 1) Upsert the Luxel property, matched by the Hospitable property id.
    const propertyId = await upsertHospitableProperty(supabase, customerId, rp);
    if (!propertyId) continue;

    // 2) Reservations → calendar blocks (full refresh of the hosp: namespace).
    const startDate = iso(new Date(now.getTime() - 60 * DAY));
    const endDate = iso(new Date(now.getTime() + 400 * DAY));
    const reservations = await listHospitableReservations(token, rp.id, startDate, endDate);
    if (reservations) {
      const accepted = reservations.filter((r) => {
        const cat = r.reservation_status?.current?.category ?? r.status ?? '';
        return ['accepted', 'active', 'confirmed'].includes(String(cat).toLowerCase());
      });
      await supabase
        .from('calendar_blocks')
        .delete()
        .eq('property_id', propertyId)
        .like('external_uid', 'hosp:%');
      if (accepted.length) {
        await supabase.from('calendar_blocks').insert(
          accepted.map((r) => ({
            property_id: propertyId,
            starts_on: r.arrival_date.slice(0, 10),
            ends_on: r.departure_date.slice(0, 10),
            source: 'import',
            summary: `Airbnb ${r.code}`,
            external_uid: `hosp:${r.id}`,
          })),
        );
      }
      reservationCount += accepted.length;
    }

    // 3) Cleaning suggestions from the fresh check-outs.
    const c = await suggestCleaningsFromCheckouts(propertyId);
    cleaningCount += c.suggested;

    // 4) Conversations: history feeds grounding; new guest messages get the AI.
    if (reservations?.length) {
      const conv = await syncConversations(
        supabase,
        token,
        propertyId,
        reservations,
        watermark,
        now,
      );
      messagesImported += conv.imported;
      aiReplies += conv.replies;
    }
  }

  await pruneToHospitable(
    supabase,
    customerId,
    remote.map((rp) => rp.id),
  );

  await supabase
    .from('channel_connections')
    .update({
      last_synced_at: new Date().toISOString(),
      messages_synced_at: new Date().toISOString(),
      status: 'connected',
    })
    .eq('customer_id', customerId)
    .eq('provider', 'hospitable');

  return {
    ok: true,
    properties: remote.length,
    reservations: reservationCount,
    cleanings: cleaningCount,
    messagesImported,
    aiReplies,
  };
}
