import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import {
  listHospitableProperties,
  listHospitableReservations,
  listHospitableMessages,
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
    const coords = rp.address?.coordinates;
    const lat = coords?.latitude != null ? Number(coords.latitude) : null;
    const lng = coords?.longitude != null ? Number(coords.longitude) : null;

    // 1) Upsert the Luxel property, matched by the Hospitable property id.
    const { data: existing } = await supabase
      .from('properties')
      .select('id')
      .eq('owner_id', customerId)
      .eq('external_listing_id', rp.id)
      .maybeSingle();

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
      updated_at: new Date().toISOString(),
    };

    let propertyId: string;
    if (existing) {
      propertyId = existing.id as string;
      await supabase.from('properties').update(fields).eq('id', propertyId);
    } else {
      const { data: created } = await supabase
        .from('properties')
        .insert({ owner_id: customerId, ...fields })
        .select('id')
        .single();
      if (!created) continue;
      propertyId = created.id as string;
      await supabase
        .from('property_access')
        .insert({ property_id: propertyId, method: 'physical_none' });
    }

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
