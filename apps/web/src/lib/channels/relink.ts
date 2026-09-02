import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChannelListing, ChannelReservation, ProviderId } from './types';
import { encodeRef } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any, 'public', any>;

interface RelinkResult {
  relinked: number;
  checkinsMoved: number;
  unmatched: string[];
}

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
  const needsRelink = stored.filter((p) => !incomingIds.has(p.external_listing_id as string));
  if (!needsRelink.length) return result;

  for (const property of needsRelink) {
    const { data: mine } = await supabase
      .from('checkins')
      .select('id, reservation_uid, confirmation_code')
      .eq('property_id', property.id)
      .not('confirmation_code', 'is', null);

    const { data: blocks } = await supabase
      .from('calendar_blocks')
      .select('confirmation_code')
      .eq('property_id', property.id)
      .not('confirmation_code', 'is', null);

    const myCodes = new Set(
      [
        ...(mine ?? []).map((c) => c.confirmation_code),
        ...(blocks ?? []).map((b) => b.confirmation_code),
      ]
        .map((c) => String(c).trim())
        .filter(Boolean),
    );
    if (!myCodes.size) {
      result.unmatched.push(property.external_listing_id as string);
      continue;
    }

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

    const { data: held, error: heldError } = await supabase
      .from('listing_assignments')
      .select('customer_id')
      .eq('external_listing_id', matched.listingId)
      .maybeSingle();
    if (heldError) {
      result.unmatched.push(oldExternalId);
      continue;
    }

    if (held && held.customer_id !== customerId) {
      result.unmatched.push(oldExternalId);
      continue;
    }

    if (held) {
      await supabase
        .from('listing_assignments')
        .delete()
        .eq('external_listing_id', oldExternalId)
        .eq('customer_id', customerId);
    } else {
      const { error } = await supabase
        .from('listing_assignments')
        .update({ external_listing_id: matched.listingId })
        .eq('external_listing_id', oldExternalId)
        .eq('customer_id', customerId);
      if (error) {
        result.unmatched.push(oldExternalId);
        continue;
      }
    }

    await supabase
      .from('properties')
      .update({ external_listing_id: matched.listingId })
      .eq('id', property.id);
    result.relinked += 1;

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

export function pruneWouldWipeEverything(storedIds: string[], remoteIds: string[]): boolean {
  if (!storedIds.length || !remoteIds.length) return false;
  const remote = new Set(remoteIds);
  return !storedIds.some((id) => remote.has(id));
}
