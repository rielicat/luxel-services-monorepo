import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChannelListing, ChannelReservation, ProviderId } from './types';
import { encodeRef, refPattern } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any, 'public', any>;

/**
 * Re-keys an existing mirror from one provider's ids to another's.
 *
 * Without this, changing provider is destructive rather than a migration: the
 * strict mirror deletes every property whose external_listing_id is absent from
 * the remote set, and a new provider's ids share nothing with the old ones. The
 * whole subtree — access codes, cleaning history, guest check-in records, add-on
 * config — cascades away while the sync reports success.
 *
 * The bridge is the OTA's own confirmation code, which both providers report for
 * the same physical stay (Hospitable `code`, Beds24 `apiReference`). It belongs
 * to Airbnb, so it is stable across a change of PMS in a way no vendor id is.
 *
 * This NEVER guesses. A property is re-keyed only when a stay recorded against
 * it carries a confirmation code that the incoming listing also reports. No
 * shared code means no match, and the caller must not prune.
 */

export interface RelinkResult {
  /** Properties re-keyed onto the new provider's ids. */
  relinked: number;
  /** Check-in rows moved to the new namespace, keeping tokens and watermarks. */
  checkinsMoved: number;
  /** Stored listings with no evidence tying them to any incoming listing. */
  unmatched: string[];
}

/**
 * @param reservationsByListing incoming reservations grouped by the NEW listing
 *        id they belong to. Confirmation codes come from here.
 */
export async function relinkByConfirmationCode(
  supabase: Supabase,
  customerId: string,
  provider: ProviderId,
  listings: ChannelListing[],
  reservationsByListing: Map<string, ChannelReservation[]>,
): Promise<RelinkResult> {
  const result: RelinkResult = { relinked: 0, checkinsMoved: 0, unmatched: [] };

  const { data: stored } = await supabase
    .from('properties')
    .select('id, external_listing_id')
    .eq('owner_id', customerId)
    .not('external_listing_id', 'is', null);
  if (!stored?.length) return result;

  const incomingIds = new Set(listings.map((l) => l.ref.id));
  // Anything already on the new provider's ids needs nothing.
  const needsRelink = stored.filter((p) => !incomingIds.has(p.external_listing_id as string));
  if (!needsRelink.length) return result;

  for (const property of needsRelink) {
    // Which confirmation codes has this property's history recorded?
    const { data: mine } = await supabase
      .from('checkins')
      .select('id, reservation_uid, confirmation_code')
      .eq('property_id', property.id)
      .not('confirmation_code', 'is', null);
    const myCodes = new Set(
      (mine ?? []).map((c) => String(c.confirmation_code).trim()).filter(Boolean),
    );
    if (!myCodes.size) {
      result.unmatched.push(property.external_listing_id as string);
      continue;
    }

    // Find the incoming listing whose reservations share a code with it.
    let matched: { listingId: string; byCode: Map<string, string> } | null = null;
    for (const listing of listings) {
      const byCode = new Map<string, string>();
      for (const r of reservationsByListing.get(listing.ref.id) ?? []) {
        const code = r.confirmationCode?.trim();
        if (code) byCode.set(code, r.ref.id);
      }
      if ([...byCode.keys()].some((code) => myCodes.has(code))) {
        matched = { listingId: listing.ref.id, byCode };
        break;
      }
    }
    if (!matched) {
      result.unmatched.push(property.external_listing_id as string);
      continue;
    }

    const oldExternalId = property.external_listing_id as string;

    // The tenant boundary moves with the property, or the customer loses access
    // to their own listing on the next scoped fetch.
    await supabase
      .from('listing_assignments')
      .update({ external_listing_id: matched.listingId })
      .eq('external_listing_id', oldExternalId)
      .eq('customer_id', customerId);

    await supabase
      .from('properties')
      .update({ external_listing_id: matched.listingId })
      .eq('id', property.id);
    result.relinked += 1;

    // Re-key check-ins IN PLACE rather than letting a second namespace appear
    // beside the first. The token stays valid, so a guest holding a link keeps
    // it; notified_at, reminded_at and access_sent_at carry over, so nobody is
    // messaged twice; submitted_at carries over, so compliance records survive.
    for (const row of mine ?? []) {
      const code = String(row.confirmation_code).trim();
      const newId = matched.byCode.get(code);
      if (!newId) continue;
      const next = encodeRef({ provider, id: newId });
      if (row.reservation_uid === next) continue;
      const { error } = await supabase
        .from('checkins')
        .update({ reservation_uid: next })
        .eq('id', row.id);
      if (!error) result.checkinsMoved += 1;
    }
  }

  return result;
}

/**
 * The guard that makes a provider switch survivable even when relinking finds
 * nothing: if the incoming id set and the stored id set are DISJOINT while both
 * are non-empty, this is not "every listing was removed upstream" — it is a
 * different account, a different provider, or a misconfiguration. Pruning on it
 * deletes everything the customer has.
 */
export function pruneWouldWipeEverything(storedIds: string[], remoteIds: string[]): boolean {
  if (!storedIds.length || !remoteIds.length) return false;
  const remote = new Set(remoteIds);
  return !storedIds.some((id) => remote.has(id));
}

/** Rows still carrying a previous provider's namespace after a relink — useful
 *  for an operator to see what did not migrate. */
export async function staleNamespaceCount(
  supabase: Supabase,
  propertyId: string,
  previous: ProviderId,
): Promise<number> {
  const { count } = await supabase
    .from('checkins')
    .select('*', { count: 'exact', head: true })
    .eq('property_id', propertyId)
    .like('reservation_uid', refPattern(previous));
  return count ?? 0;
}
