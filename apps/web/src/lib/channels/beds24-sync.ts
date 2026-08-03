import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { Beds24Provider } from './beds24';
import { relinkByConfirmationCode, pruneWouldWipeEverything } from './relink';
import { allowedListingIds } from './scope';
import { suggestCleaningsFromCheckouts } from '@/lib/cleaning/schedule';
import { autoConfirmSuggested } from '@/lib/cleaning/notify';
import { checkinToken } from '@/lib/checkin/tokens';
import { encodeRef, refPattern, type ChannelListing, type ChannelReservation } from './types';

/**
 * The Beds24 mirror.
 *
 * Ordering matters more than anything else in this file. The tenant boundary
 * (listing_assignments) is keyed on the PREVIOUS provider's ids, so scoping
 * before re-keying would filter every listing out and leave the customer with an
 * empty account. Re-key first, then scope, then mirror.
 *
 * Messaging is deliberately absent. The listing is connected at `connect: none`,
 * so Beds24 holds bookings but has no live channel link and no message threads.
 * Check-in anchors are created with a null `notified_at`, which the reminder
 * pass already treats as "never messaged" — so when messaging is switched on,
 * these guests are not blasted with a backlog of links.
 */

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const santiagoDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(d);

export interface Beds24SyncResult {
  ok: boolean;
  properties: number;
  reservations: number;
  relinked: number;
  checkinsMoved: number;
  unmatched: string[];
  reason?: string;
}

function upsertFields(l: ChannelListing) {
  const raw = l.raw as { city?: string | null; address?: string | null } | null;
  return {
    nickname: l.name || 'Propiedad Airbnb',
    address: raw?.address ?? null,
    comuna: raw?.city ?? null,
    platform: 'airbnb',
    external_listing_id: l.ref.id,
    checkin_time: l.checkinTime,
    checkout_time: l.checkoutTime,
    listed: l.listed,
    updated_at: new Date().toISOString(),
  };
}

export async function syncBeds24Account(
  customerId: string,
  refreshToken: string,
  now: Date = new Date(),
): Promise<Beds24SyncResult> {
  const supabase = createSupabaseServiceRoleClient();
  const provider = new Beds24Provider(refreshToken);
  const empty: Beds24SyncResult = {
    ok: false,
    properties: 0,
    reservations: 0,
    relinked: 0,
    checkinsMoved: 0,
    unmatched: [],
  };

  // 1) Everything the operator account can see. null = incomplete; abort rather
  //    than let a partial read drive a prune.
  const all = await provider.listListings();
  if (!all) return { ...empty, reason: 'listings_unavailable' };

  const today = santiagoDate(now);
  const from = iso(new Date(now.getTime() - 30 * DAY));
  const to = iso(new Date(now.getTime() + 400 * DAY));

  // 2) Reservations for every listing — needed BEFORE scoping, because the
  //    confirmation codes in them are what re-key the tenant boundary.
  const byListing = new Map<string, ChannelReservation[]>();
  for (const l of all) {
    const res = await provider.listReservations(l.ref, from, to);
    if (!res) return { ...empty, reason: 'reservations_unavailable' };
    byListing.set(l.ref.id, res);
  }

  // 3) Re-key an existing mirror onto Beds24 ids. Without this the assignment
  //    filter below matches nothing and the customer's account looks empty.
  const relink = await relinkByConfirmationCode(supabase, customerId, 'beds24', all, byListing);

  // 4) Only now is the tenant boundary meaningful.
  const allowed = await allowedListingIds(customerId);
  if (!allowed) return { ...empty, reason: 'assignments_unreadable', ...relink };
  const allowedSet = new Set(allowed);
  const mine = all.filter((l) => allowedSet.has(l.ref.id));

  let reservations = 0;
  for (const listing of mine) {
    const fields = upsertFields(listing);
    const { data: row } = await supabase
      .from('properties')
      .upsert({ owner_id: customerId, ...fields }, { onConflict: 'owner_id,external_listing_id' })
      .select('id')
      .single();
    if (!row) continue;
    const propertyId = row.id as string;

    await supabase
      .from('property_access')
      .upsert(
        { property_id: propertyId, method: 'physical_none' },
        { onConflict: 'property_id', ignoreDuplicates: true },
      );

    const res = byListing.get(listing.ref.id) ?? [];
    const live = res.filter((r) => r.state !== 'cancelled');
    reservations += live.length;

    // Calendar blocks are a disposable mirror: replace this provider's
    // namespace wholesale rather than diffing.
    await supabase
      .from('calendar_blocks')
      .delete()
      .eq('property_id', propertyId)
      .like('external_uid', refPattern('beds24'));
    if (live.length) {
      await supabase.from('calendar_blocks').insert(
        live.map((r) => ({
          property_id: propertyId,
          starts_on: r.arrivalDate,
          ends_on: r.departureDate,
          source: 'import',
          summary: `Airbnb ${r.confirmationCode ?? ''}`.trim(),
          confirmation_code: r.confirmationCode,
          external_uid: encodeRef(r.ref),
        })),
      );
    }

    // Check-in anchors for future stays. No message is sent: there is no thread
    // to send into at connect: none. notified_at stays null, which is exactly
    // what the reminder pass reads as "never contacted".
    for (const r of live) {
      if (r.arrivalDate < today) continue;
      await supabase.from('checkins').insert({
        property_id: propertyId,
        token: checkinToken(),
        status: 'pending',
        reservation_uid: encodeRef(r.ref),
        confirmation_code: r.confirmationCode,
        arrival_date: r.arrivalDate,
        departure_date: r.departureDate,
        notify_result: { beds24: 'messaging_unavailable' },
      });
      // A duplicate uid is the normal case on every sync after the first; the
      // unique index rejects it and there is nothing to do.
    }

    await suggestCleaningsFromCheckouts(propertyId);
    await autoConfirmSuggested(propertyId, today);
  }

  // 5) Prune, with the same two guards the Hospitable path uses.
  const remoteIds = mine.map((l) => l.ref.id);
  if (remoteIds.length) {
    const { data: stored } = await supabase
      .from('properties')
      .select('external_listing_id')
      .eq('owner_id', customerId)
      .not('external_listing_id', 'is', null);
    const storedIds = (stored ?? []).map((r) => r.external_listing_id as string);
    if (pruneWouldWipeEverything(storedIds, remoteIds)) {
      console.warn('beds24.prune_skipped_disjoint', {
        customerId,
        stored: storedIds.length,
        remote: remoteIds.length,
      });
    } else {
      await supabase
        .from('properties')
        .delete()
        .eq('owner_id', customerId)
        .not('external_listing_id', 'in', `(${remoteIds.map((id) => `"${id}"`).join(',')})`);
    }
  }

  return {
    ok: true,
    properties: mine.length,
    reservations,
    relinked: relink.relinked,
    checkinsMoved: relink.checkinsMoved,
    unmatched: relink.unmatched,
  };
}
