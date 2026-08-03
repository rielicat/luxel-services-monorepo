import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import {
  listHospitableProperties,
  listHospitableReservations,
  listHospitableMessages,
  sendHospitableMessage,
  type HospitableProperty,
  type HospitableReservation,
} from './hospitable';
import { suggestCleaningsFromCheckouts } from '@/lib/cleaning/schedule';
import { autoConfirmSuggested } from '@/lib/cleaning/notify';
import { checkinToken } from '@/lib/checkin/tokens';
import { remindAndDeliverAccess } from '@/lib/checkin/reminders';
import { appUrl } from '@/lib/urls';
import { allowedListingIds, claimListing, type ChannelScope } from './scope';
import { handleInboundMessage } from './pipeline';
import { pruneWouldWipeEverything } from './relink';

/**
 * The tenant filter for every central-credential fetch. With `own` scope the
 * token itself is the boundary and the list passes through; with `central` it
 * spans all managed hosts, so only listings ASSIGNED to this customer survive.
 * Anything unassigned belongs to nobody and is invisible until an operator
 * assigns it.
 */
async function scopeToCustomer<T extends { id: string }>(
  customerId: string,
  remote: T[],
  scope: ChannelScope,
): Promise<T[] | null> {
  if (scope === 'own') {
    // Everything an own token returns is theirs — record it so the assignment
    // table stays the single authority on ownership even for self-connected
    // hosts (otherwise the mirror and the tenant boundary drift apart).
    for (const rp of remote) await claimListing(rp.id, customerId);
    return remote;
  }
  const allowed = await allowedListingIds(customerId);
  // null = the assignment read FAILED. Returning [] here would look identical
  // to "assigned nothing" to every caller downstream; abort instead.
  if (!allowed) return null;
  const set = new Set(allowed);
  return remote.filter((rp) => set.has(rp.id));
}

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
// Calendar dates are host-local: computing them in UTC would skip same-day
// arrivals every Chilean evening (UTC rolls over at 20:00–21:00 Santiago).
const santiagoDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(d);

/** The check-in link is part of the reservation, not a button: each newly
 *  imported future reservation gets one message with its tokenized link, and a
 *  reservation that disappears upstream (cancellation) gets its unsubmitted
 *  link revoked. The unique `reservation_uid` makes the send once-only.
 *
 *  Guests who booked before this feature existed must NEVER be messaged: the
 *  first sync that sees a property seeds anchors for its current reservations
 *  silently and stamps `checkin_links_backfilled_at`. Only reservations that
 *  show up after that stamp get a message — which covers both brand-new
 *  connections and accounts already running when the feature shipped. */
async function sendCheckinLinksForNewReservations(
  supabase: Supabase,
  hospToken: string,
  propertyId: string,
  accepted: HospitableReservation[],
  today: string,
): Promise<void> {
  // Revoke links whose reservation no longer exists upstream — mirrors the
  // calendar_blocks refresh, and only runs after a successful reservations
  // fetch, so an API failure can never mass-revoke.
  const uids = accepted.map((r) => `hosp:${r.id}`);
  const notInList = (q: ReturnType<typeof revokeBase>) =>
    uids.length ? q.not('reservation_uid', 'in', `(${uids.map((u) => `"${u}"`).join(',')})`) : q;
  function revokeBase() {
    return supabase
      .from('checkins')
      .update({ revoked_at: new Date().toISOString() })
      .eq('property_id', propertyId)
      .like('reservation_uid', 'hosp:%')
      .is('revoked_at', null);
  }
  // Mark first, delete second. A submitted check-in is retained for compliance,
  // so deletion cannot be what stops its link working — without the stamp, a
  // guest whose reservation was cancelled keeps a live view of the property's
  // current access code.
  await notInList(revokeBase());
  let purge = supabase
    .from('checkins')
    .delete()
    .eq('property_id', propertyId)
    .like('reservation_uid', 'hosp:%')
    .is('submitted_at', null)
    // Rows that already messaged a guest keep their send-once watermarks;
    // deleting and re-creating one would message that guest all over again.
    .is('reminded_at', null)
    .is('access_sent_at', null);
  if (uids.length) {
    purge = purge.not('reservation_uid', 'in', `(${uids.map((u) => `"${u}"`).join(',')})`);
  }
  await purge;

  const { data: prop } = await supabase
    .from('properties')
    .select('nickname, checkin_links_backfilled_at')
    .eq('id', propertyId)
    .maybeSingle();
  const backfill = prop != null && prop.checkin_links_backfilled_at == null;
  for (const r of accepted) {
    try {
      if (r.arrival_date.slice(0, 10) < today) continue;
      const uid = `hosp:${r.id}`;
      let linkToken = checkinToken();
      const { error } = await supabase.from('checkins').insert({
        property_id: propertyId,
        token: linkToken,
        status: 'pending',
        reservation_uid: uid,
        confirmation_code: r.code || null,
        arrival_date: r.arrival_date.slice(0, 10),
        departure_date: r.departure_date.slice(0, 10),
        ...(backfill ? { notify_result: { hospitable: 'skipped_backfill' } } : {}),
      });
      if (error) {
        // uid already claimed. Only skip if that claim actually concluded
        // (sent, or deliberately skipped) — a crash between insert and send
        // leaves notified_at AND notify_result null, and that row should
        // resend with its already-issued token.
        const { data: existing } = await supabase
          .from('checkins')
          .select(
            'token, notified_at, notify_result, arrival_date, departure_date, confirmation_code',
          )
          .eq('reservation_uid', uid)
          .maybeSingle();
        if (!existing) continue;

        // Guests move their dates. calendar_blocks is refreshed wholesale every
        // sync but this row was written once at insert, so a moved stay would
        // keep nudging and revealing access against dates that are no longer
        // true — including after the guest has already left. Re-arm both passes
        // when the arrival actually moves.
        const arrival = r.arrival_date.slice(0, 10);
        const departure = r.departure_date.slice(0, 10);
        if (
          existing.arrival_date !== arrival ||
          existing.departure_date !== departure ||
          (r.code && !existing.confirmation_code)
        ) {
          await supabase
            .from('checkins')
            .update({
              arrival_date: arrival,
              departure_date: departure,
              ...(r.code ? { confirmation_code: r.code } : {}),
              ...(existing.arrival_date !== arrival
                ? { reminded_at: null, access_sent_at: null, access_claim_at: null }
                : {}),
            })
            .eq('reservation_uid', uid);
        }

        if (existing.notified_at || existing.notify_result) continue;
        linkToken = existing.token as string;
      } else if (backfill) {
        continue; // anchor seeded, nothing sent — booked before the feature
      }
      const url = `${appUrl()}/checkin/${linkToken}`;
      const sent = await sendHospitableMessage(
        hospToken,
        r.id,
        `¡Hola! Gracias por tu reserva en ${prop?.nickname ?? 'nuestro alojamiento'}. Para agilizar tu llegada, completa tu check-in online aquí: ${url}`,
      );
      if (sent) {
        await supabase
          .from('checkins')
          .update({ notified_at: new Date().toISOString(), notify_result: { hospitable: 'sent' } })
          .eq('reservation_uid', uid);
      } else {
        await supabase
          .from('checkins')
          .delete()
          .eq('reservation_uid', uid)
          .is('submitted_at', null);
      }
    } catch {
      /* best-effort per reservation */
    }
  }
  if (backfill) {
    await supabase
      .from('properties')
      .update({ checkin_links_backfilled_at: new Date().toISOString() })
      .eq('id', propertyId);
  }
}

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
    // The host's own nickname is the title; the public listing headline is a
    // marketing string ("Depto 3D/2B + AC…"), not how the owner names the unit.
    nickname: rp.name || rp.public_name || 'Propiedad Airbnb',
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
 *  (listHospitableProperties is complete-or-nothing).
 *
 *  An EMPTY set NEVER prunes, in either scope: freeze, don't wipe. Emptiness is
 *  ambiguous — a "0 listings" API response, a failed assignment read, or a
 *  listing set that simply isn't in this account all look the same here, and
 *  wiping a customer's whole subtree off any of them is far worse than briefly
 *  showing a listing that went away. Offboarding deletes deliberately, via
 *  `unassignListing`. */
async function pruneToHospitable(
  supabase: Supabase,
  customerId: string,
  remoteIds: string[],
): Promise<void> {
  if (!remoteIds.length) return;

  // A remote set that shares NOTHING with what is stored is not a list of
  // removals — it is a different account, or a different provider. Pruning on it
  // deletes the customer's entire subtree while reporting success, which is
  // exactly what a provider switch looks like from in here.
  const { data: existing } = await supabase
    .from('properties')
    .select('external_listing_id')
    .eq('owner_id', customerId)
    .not('external_listing_id', 'is', null);
  const storedIds = (existing ?? []).map((r) => r.external_listing_id as string);
  if (pruneWouldWipeEverything(storedIds, remoteIds)) {
    console.warn('sync.prune_skipped_disjoint', {
      customerId,
      stored: storedIds.length,
      remote: remoteIds.length,
    });
    return;
  }

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
  scope: ChannelScope = 'own',
): Promise<HospitableReconcileResult> {
  const supabase = createSupabaseServiceRoleClient();
  const all = await listHospitableProperties(token);
  if (!all) return { ok: false, properties: 0, accountLabel: null };
  // Under the central credential the fetch spans every managed host, so the
  // assignment table — not the token — decides what belongs to this customer.
  // null means the assignment read failed: abort rather than act on a set we
  // can't trust (an empty one would look like "owns nothing").
  const remote = await scopeToCustomer(customerId, all, scope);
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
        // Idempotent against the (thread_id, external_id) unique index —
        // concurrent syncs can't double-import history.
        await supabase.from('guest_messages').upsert(
          {
            thread_id: thread.id,
            direction: isGuest ? 'in' : 'out',
            source: isGuest ? 'guest' : 'host',
            body: m.body,
            external_id: m.id,
          },
          { onConflict: 'thread_id,external_id', ignoreDuplicates: true },
        );
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
  scope: ChannelScope = 'own',
): Promise<HospitableSyncResult> {
  const supabase = createSupabaseServiceRoleClient();
  const all = await listHospitableProperties(token);
  if (!all)
    return {
      ok: false,
      properties: 0,
      reservations: 0,
      cleanings: 0,
      messagesImported: 0,
      aiReplies: 0,
    };
  // Same tenant filter as the light reconcile: under the central credential a
  // customer only ever gets the listings assigned to them.
  const remote = await scopeToCustomer(customerId, all, scope);
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
            // The OTA's own code — the one identifier that survives a change of
            // PMS. Kept in a real column, not only in the summary above.
            confirmation_code: r.code || null,
            external_uid: `hosp:${r.id}`,
          })),
        );
      }
      reservationCount += accepted.length;

      // 2b) Every NEW future reservation gets its check-in link sent into the
      // guest thread automatically — send-once, anchored on the reservation uid.
      await sendCheckinLinksForNewReservations(
        supabase,
        token,
        propertyId,
        accepted,
        santiagoDate(now),
      );

      // 2c) Guests who never opened that link still have to get in: nudge the
      // day before, deliver access on arrival day.
      await remindAndDeliverAccess(
        supabase,
        token,
        propertyId,
        new Map(accepted.map((r) => [`hosp:${r.id}`, r.id])),
        santiagoDate(now),
      );
    }

    // 3) Cleaning suggestions from the fresh check-outs — and, unless the host
    // opted out, they confirm themselves and notify whoever runs the turnover.
    const c = await suggestCleaningsFromCheckouts(propertyId);
    cleaningCount += c.suggested;
    await autoConfirmSuggested(propertyId, santiagoDate(now));

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

  // Upsert, not update: a centrally-managed customer has no connection row of
  // their own, and without one the watermark never advances — the full sync
  // would re-run on every page load and no guest message would ever count as
  // "new", so the AI would never reply. The row carries no token.
  await supabase.from('channel_connections').upsert(
    {
      customer_id: customerId,
      provider: 'hospitable',
      last_synced_at: new Date().toISOString(),
      messages_synced_at: new Date().toISOString(),
      status: 'connected',
    },
    { onConflict: 'customer_id,provider' },
  );

  return {
    ok: true,
    properties: remote.length,
    reservations: reservationCount,
    cleanings: cleaningCount,
    messagesImported,
    aiReplies,
  };
}
