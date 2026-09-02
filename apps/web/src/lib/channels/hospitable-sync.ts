import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import {
  listHospitableProperties,
  listHospitableReservations,
  listHospitableMessages,
  listHospitableTeammates,
  sendHospitableMessage,
  toChannelListing,
  toChannelReservation,
  type HospitableProperty,
  type HospitableReservation,
  type HospitableTeammate,
} from './hospitable';
import { suggestCleaningsFromCheckouts } from '@/lib/cleaning/schedule';
import { autoConfirmSuggested } from '@/lib/cleaning/notify';
import { checkinToken } from '@/lib/checkin/tokens';
import { bookingMessage } from '@/lib/checkin/copy';
import { resolveGuestLang } from '@/lib/checkin/lang';
import { RETENTION_DAYS, santiagoToday, shiftDate } from '@/lib/checkin/window';
import { appUrl } from '@/lib/urls';
import { toE164Digits } from '@/lib/phone';
import { allowedListingIds, claimListing, type ChannelScope } from './scope';
import { handleInboundMessage } from './pipeline';
import {
  pruneWouldWipeEverything,
  rekeyCheckinsByConfirmationCode,
  relinkByConfirmationCode,
} from './relink';
import { encodeRef, refPattern, type ChannelReservation } from './types';

const ref = (id: string) => encodeRef({ provider: 'hospitable', id });
const HOSP = refPattern('hospitable');

async function scopeToCustomer<T extends { id: string }>(
  customerId: string,
  remote: T[],
  scope: ChannelScope,
): Promise<T[] | null> {
  if (scope === 'own') {
    for (const rp of remote) await claimListing(rp.id, customerId);
    return remote;
  }
  const allowed = await allowedListingIds(customerId);
  if (!allowed) return null;
  const set = new Set(allowed);
  return remote.filter((rp) => set.has(rp.id));
}

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

const languageOf = (r: HospitableReservation): string | null => {
  const code = (r.guest?.language ?? r.conversation_language ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 2);
  return /^[a-z]{2}$/.test(code) ? code : null;
};

async function sendCheckinLinksForNewReservations(
  supabase: Supabase,
  hospToken: string,
  propertyId: string,
  accepted: HospitableReservation[],
  today: string,
): Promise<void> {
  const uidByCode = new Map<string, string>();
  for (const r of accepted) {
    const code = (r.code || '').trim();
    if (code && !uidByCode.has(code)) uidByCode.set(code, ref(r.id));
  }
  const rekeyed = await rekeyCheckinsByConfirmationCode(supabase, propertyId, uidByCode);
  if (rekeyed) console.warn('sync.checkins_rekeyed', { propertyId, rekeyed });

  const uids = accepted.map((r) => ref(r.id));
  const notInList = (q: ReturnType<typeof revokeBase>) =>
    uids.length ? q.not('reservation_uid', 'in', `(${uids.map((u) => `"${u}"`).join(',')})`) : q;
  function revokeBase() {
    return supabase
      .from('checkins')
      .update({ revoked_at: new Date().toISOString() })
      .eq('property_id', propertyId)
      .like('reservation_uid', HOSP)
      .is('revoked_at', null);
  }
  await notInList(revokeBase());
  let purge = supabase
    .from('checkins')
    .delete()
    .eq('property_id', propertyId)
    .like('reservation_uid', HOSP)
    .is('submitted_at', null);
  if (uids.length) {
    purge = purge.not('reservation_uid', 'in', `(${uids.map((u) => `"${u}"`).join(',')})`);
  }
  await purge;

  const { data: prop } = await supabase
    .from('properties')
    .select('checkin_links_backfilled_at')
    .eq('id', propertyId)
    .maybeSingle();
  const backfill = prop != null && prop.checkin_links_backfilled_at == null;
  for (const r of accepted) {
    try {
      if (r.arrival_date.slice(0, 10) < today) continue;
      const uid = ref(r.id);
      const lang = languageOf(r);
      let linkToken = checkinToken();
      const { error } = await supabase.from('checkins').insert({
        property_id: propertyId,
        token: linkToken,
        status: 'pending',
        reservation_uid: uid,
        confirmation_code: r.code || null,
        arrival_date: r.arrival_date.slice(0, 10),
        departure_date: r.departure_date.slice(0, 10),
        guest_language: lang,
        expected_guests: r.guests?.total ?? null,
        ...(backfill ? { notify_result: { hospitable: 'skipped_backfill' } } : {}),
      });
      if (error) {
        const { data: existing } = await supabase
          .from('checkins')
          .select(
            'token, notified_at, notify_result, arrival_date, departure_date, confirmation_code, guest_language',
          )
          .eq('reservation_uid', uid)
          .maybeSingle();
        if (!existing) continue;

        const arrival = r.arrival_date.slice(0, 10);
        const departure = r.departure_date.slice(0, 10);
        if (
          existing.arrival_date !== arrival ||
          existing.departure_date !== departure ||
          (r.code && !existing.confirmation_code) ||
          (lang && !existing.guest_language)
        ) {
          await supabase
            .from('checkins')
            .update({
              arrival_date: arrival,
              departure_date: departure,
              ...(r.code ? { confirmation_code: r.code } : {}),
              ...(lang && !existing.guest_language ? { guest_language: lang } : {}),
            })
            .eq('reservation_uid', uid);
        }

        if (existing.notified_at || existing.notify_result) continue;
        linkToken = existing.token as string;
      } else if (backfill) {
        continue;
      }
      const url = `${appUrl()}/checkin/${linkToken}`;
      const sent = await sendHospitableMessage(
        hospToken,
        r.id,
        bookingMessage(resolveGuestLang(lang, null), {
          url,
          arrival: r.arrival_date.slice(0, 10),
          departure: r.departure_date.slice(0, 10),
        }),
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
    } catch {}
  }
  if (backfill) {
    await supabase
      .from('properties')
      .update({ checkin_links_backfilled_at: new Date().toISOString() })
      .eq('id', propertyId);
  }
}

interface HospitableSyncResult {
  ok: boolean;
  properties: number;
  reservations: number;
  contacts: number;
  cleanings: number;
  messagesImported: number;
  aiReplies: number;
  relinked: number;
}

type Supabase = ReturnType<typeof createSupabaseServiceRoleClient>;

async function upsertHospitableProperty(
  supabase: Supabase,
  customerId: string,
  rp: HospitableProperty,
): Promise<string | null> {
  const coords = rp.address?.coordinates;
  const lat = coords?.latitude != null ? Number(coords.latitude) : null;
  const lng = coords?.longitude != null ? Number(coords.longitude) : null;

  const fields = {
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
    listing_details: rp.details ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data: row } = await supabase
    .from('properties')
    .upsert({ owner_id: customerId, ...fields }, { onConflict: 'owner_id,external_listing_id' })
    .select('id')
    .single();
  if (!row) return null;
  await supabase
    .from('property_access')
    .upsert(
      { property_id: row.id as string, method: 'physical_none' },
      { onConflict: 'property_id', ignoreDuplicates: true },
    );
  return row.id as string;
}

type ContactRole = 'cleaning' | 'concierge';
interface MirroredProperty {
  id: string;
  externalListingId: string;
}

const CLEANING_SERVICES = new Set([1, 7]);
const CONCIERGE_SERVICES = new Set([2, 3, 4]);

function teammateRoles(tm: HospitableTeammate): ContactRole[] {
  if (tm.all_services) return ['cleaning', 'concierge'];
  const ids = (tm.services ?? []).map((s) => s.id);
  const roles: ContactRole[] = [];
  if (ids.some((id) => CLEANING_SERVICES.has(id))) roles.push('cleaning');
  if (ids.some((id) => CONCIERGE_SERVICES.has(id))) roles.push('concierge');
  return roles;
}

function teammateListingIds(tm: HospitableTeammate): Set<string> | 'all' {
  if (tm.all_properties || tm.properties === 'all') return 'all';
  const ids = new Set<string>();
  for (const p of Array.isArray(tm.properties) ? tm.properties : []) {
    if (typeof p === 'string') ids.add(p);
    else if (p && typeof p === 'object' && typeof (p as { id?: unknown }).id === 'string')
      ids.add((p as { id: string }).id);
  }
  return ids;
}

const contactKey = (propertyId: string, role: string, externalId: string) =>
  `${propertyId}|${role}|${externalId}`;

export async function mirrorTeammates(
  supabase: Supabase,
  token: string,
  customerId: string,
  propertyRows: MirroredProperty[],
): Promise<number> {
  if (!propertyRows.length) return 0;
  try {
    const teammates = await listHospitableTeammates(token);
    if (!teammates) return 0;

    const desired = new Map<
      string,
      {
        property_id: string;
        role: ContactRole;
        external_id: string;
        name: string | null;
        email: string | null;
        whatsapp: string | null;
      }
    >();
    for (const tm of teammates) {
      const digits = toE164Digits(tm.phone_number);
      const email = tm.email?.trim() || null;
      if (!digits && !email) continue;
      const roles = teammateRoles(tm);
      if (!roles.length) continue;
      const scope = teammateListingIds(tm);
      const targets =
        scope === 'all' ? propertyRows : propertyRows.filter((p) => scope.has(p.externalListingId));
      for (const p of targets) {
        for (const role of roles) {
          desired.set(contactKey(p.id, role, tm.id), {
            property_id: p.id,
            role,
            external_id: tm.id,
            name: tm.name?.trim() || null,
            email,
            whatsapp: digits ? `+${digits}` : null,
          });
        }
      }
    }

    const rows = [...desired.values()];
    if (rows.length) {
      const { error } = await supabase
        .from('property_contacts')
        .upsert(rows, { onConflict: 'property_id,role,external_id' });
      if (error) {
        console.warn('sync.teammates_upsert_failed', { customerId, message: error.message });
        return 0;
      }
    }

    const { data: existing, error } = await supabase
      .from('property_contacts')
      .select('id, property_id, role, external_id')
      .in(
        'property_id',
        propertyRows.map((p) => p.id),
      );
    if (error) return rows.length;
    const stale = (existing ?? [])
      .filter(
        (r) =>
          !r.external_id ||
          !desired.has(contactKey(r.property_id as string, r.role as string, r.external_id)),
      )
      .map((r) => r.id as string);
    if (stale.length) await supabase.from('property_contacts').delete().in('id', stale);
    return rows.length;
  } catch {
    console.warn('sync.teammates_failed', { customerId });
    return 0;
  }
}

async function pruneToHospitable(
  supabase: Supabase,
  customerId: string,
  remoteIds: string[],
): Promise<void> {
  if (!remoteIds.length) return;

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

async function relinkStrayProperties(
  supabase: Supabase,
  customerId: string,
  token: string,
  all: HospitableProperty[],
  now: Date,
): Promise<number> {
  if (!all.length) return 0;
  const { data: stored } = await supabase
    .from('properties')
    .select('external_listing_id')
    .eq('owner_id', customerId)
    .not('external_listing_id', 'is', null);
  const remoteIds = new Set(all.map((rp) => rp.id));
  if (!(stored ?? []).some((p) => !remoteIds.has(p.external_listing_id as string))) return 0;

  const from = iso(new Date(now.getTime() - 400 * DAY));
  const to = iso(new Date(now.getTime() + 400 * DAY));
  const byListing = new Map<string, ChannelReservation[]>();
  for (const rp of all) {
    const res = await listHospitableReservations(token, rp.id, from, to);
    if (!res) return 0;
    byListing.set(
      rp.id,
      res.map((r) => toChannelReservation(r, rp.id)),
    );
  }

  const r = await relinkByConfirmationCode(
    supabase,
    customerId,
    'hospitable',
    all.map(toChannelListing),
    byListing,
  );
  if (r.relinked || r.unmatched.length) {
    console.warn('sync.relink', {
      customerId,
      relinked: r.relinked,
      checkinsMoved: r.checkinsMoved,
      unmatched: r.unmatched.length,
    });
  }
  return r.relinked;
}

interface HospitableReconcileResult {
  ok: boolean;
  properties: number;
  accountLabel: string | null;
}

export async function reconcileHospitableProperties(
  customerId: string,
  token: string,
  scope: ChannelScope = 'own',
): Promise<HospitableReconcileResult> {
  const supabase = createSupabaseServiceRoleClient();
  const all = await listHospitableProperties(token);
  if (!all) return { ok: false, properties: 0, accountLabel: null };
  const remote = await scopeToCustomer(customerId, all, scope);
  if (!remote) return { ok: false, properties: 0, accountLabel: null };
  const mirrored: MirroredProperty[] = [];
  for (const rp of remote) {
    const id = await upsertHospitableProperty(supabase, customerId, rp);
    if (id) mirrored.push({ id, externalListingId: rp.id });
  }
  await mirrorTeammates(supabase, token, customerId, mirrored);
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

export async function ingestThread(
  supabase: Supabase,
  token: string,
  propertyId: string,
  reservationId: string,
  watermark: string | null,
): Promise<{ imported: number; replies: number }> {
  let imported = 0;
  let replies = 0;

  const messages = await listHospitableMessages(token, reservationId);
  if (!messages?.length) return { imported, replies };
  const guestName = messages.find((m) => m.sender_type === 'guest')?.sender?.first_name ?? null;

  const { data: thread } = await supabase
    .from('guest_threads')
    .upsert(
      {
        property_id: propertyId,
        channel: 'hospitable',
        external_thread_id: reservationId,
        guest_name: guestName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'property_id,channel,external_thread_id' },
    )
    .select('id')
    .single();
  if (!thread) return { imported, replies };

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
        externalThreadId: reservationId,
        guestName,
        body: m.body,
        externalMessageId: m.id,
      });
      if (res.action === 'sent') replies++;
      imported++;
    } else {
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
  return { imported, replies };
}

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
    const one = await ingestThread(supabase, token, propertyId, r.id, watermark);
    imported += one.imported;
    replies += one.replies;
  }
  return { imported, replies };
}

async function purgeExpiredGuestDocuments(supabase: Supabase, today: string): Promise<void> {
  const { data: expired } = await supabase
    .from('checkins')
    .select('id')
    .lt('departure_date', shiftDate(today, -RETENTION_DAYS));
  const ids = (expired ?? []).map((c) => c.id as string);
  if (!ids.length) return;
  await supabase
    .from('checkin_guests')
    .update({ doc_type: null, doc_number_enc: null, doc_last4: null })
    .in('checkin_id', ids)
    .not('doc_number_enc', 'is', null);
}

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
      contacts: 0,
      cleanings: 0,
      messagesImported: 0,
      aiReplies: 0,
      relinked: 0,
    };

  const relinked = await relinkStrayProperties(supabase, customerId, token, all, now);

  const remote = await scopeToCustomer(customerId, all, scope);
  if (!remote)
    return {
      ok: false,
      properties: 0,
      reservations: 0,
      contacts: 0,
      cleanings: 0,
      messagesImported: 0,
      aiReplies: 0,
      relinked,
    };

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
  const today = santiagoToday(now);

  const mirrored: (MirroredProperty & { rp: HospitableProperty })[] = [];
  for (const rp of remote) {
    const id = await upsertHospitableProperty(supabase, customerId, rp);
    if (id) mirrored.push({ id, externalListingId: rp.id, rp });
  }
  const contactCount = await mirrorTeammates(supabase, token, customerId, mirrored);

  for (const { id: propertyId, rp } of mirrored) {
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
        .like('external_uid', HOSP);
      if (accepted.length) {
        await supabase.from('calendar_blocks').insert(
          accepted.map((r) => ({
            property_id: propertyId,
            starts_on: r.arrival_date.slice(0, 10),
            ends_on: r.departure_date.slice(0, 10),
            source: 'import',
            summary: `Airbnb ${r.code}`,
            confirmation_code: r.code || null,
            external_uid: ref(r.id),
          })),
        );
      }
      reservationCount += accepted.length;

      await sendCheckinLinksForNewReservations(supabase, token, propertyId, accepted, today);
    }

    const c = await suggestCleaningsFromCheckouts(propertyId);
    cleaningCount += c.suggested;
    await autoConfirmSuggested(propertyId, today);

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

  await purgeExpiredGuestDocuments(supabase, today);
  await pruneToHospitable(
    supabase,
    customerId,
    remote.map((rp) => rp.id),
  );

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
    contacts: contactCount,
    cleanings: cleaningCount,
    messagesImported,
    aiReplies,
    relinked,
  };
}
