import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { ownsProperty } from '@/lib/host/owner';
import { isAddonActive } from '@/lib/addons/store';
import { listPricelabsListings, pricelabsConfigured, type PricelabsRef } from './client';

/**
 * The tenant boundary for pricing. Luxel drives PriceLabs from ONE account that
 * can see every managed listing, so this module is the ONLY place allowed to
 * turn a request into a PriceLabs listing reference — and it does so exclusively
 * from a property the caller provably owns. No function here accepts a PriceLabs
 * listing id from the outside.
 */

/** Resolve (and authorise) the PriceLabs listing behind one of the caller's
 *  properties. Returns null when the caller doesn't own it, the paid add-on
 *  isn't active, or the listing isn't linked yet. */
export async function resolvePricelabsRef(
  customerId: string,
  propertyId: string,
): Promise<PricelabsRef | null> {
  if (!(await ownsProperty(customerId, propertyId))) return null;
  if (!(await isAddonActive(propertyId, 'dynamic_pricing'))) return null;
  const supabase = createSupabaseServiceRoleClient();
  // owner_id is re-checked here so a future refactor of ownsProperty can never
  // silently widen this query.
  const { data } = await supabase
    .from('properties')
    .select('pricelabs_listing_id, pricelabs_pms')
    .eq('id', propertyId)
    .eq('owner_id', customerId)
    .maybeSingle();
  const id = data?.pricelabs_listing_id as string | null;
  const pms = (data?.pricelabs_pms as string | null) ?? 'hospitable';
  return id ? { id, pms } : null;
}

/** Does this remote listing correspond to the given Airbnb/PMS listing id?
 *  PriceLabs keys listings by the PMS's own id, and also reports the channel
 *  ids, so accept a match on either — but never a fuzzy/name match. */
function matches(
  listing: {
    listing_id: string;
    channel_listing_details?: { channel_listing_id?: string | null }[];
  },
  externalListingId: string,
): boolean {
  if (listing.listing_id === externalListingId) return true;
  return (listing.channel_listing_details ?? []).some(
    (c) => c.channel_listing_id === externalListingId,
  );
}

/**
 * Detects which of Luxel's PriceLabs listings belongs to this property and
 * records the mapping — replacing the host having to attest a handshake.
 * The listing only appears under Luxel's account once the host has granted
 * manager access, so "not found yet" is the normal pending state.
 *
 * Returns the new status. Never throws.
 */
export async function linkPricelabsListing(
  propertyId: string,
): Promise<'connected' | 'pending_connection' | 'unavailable'> {
  if (!pricelabsConfigured()) return 'unavailable';
  const supabase = createSupabaseServiceRoleClient();
  const { data: prop } = await supabase
    .from('properties')
    .select('external_listing_id, pricelabs_listing_id')
    .eq('id', propertyId)
    .maybeSingle();
  const external = prop?.external_listing_id as string | null;
  if (!external) return 'pending_connection';

  const remote = await listPricelabsListings();
  // A zero-row list means Luxel's WHOLE account sees nothing (key rotated, API
  // fault) — not that this host revoked access. Never downgrade a mapping off it.
  if (!remote || !remote.length) return 'unavailable';

  const hit = remote.find((l) => matches(l, external));
  if (!hit) {
    // Manager access not granted yet (or revoked): clear a stale mapping so we
    // never keep writing prices for a listing we can no longer see.
    await supabase
      .from('properties')
      .update({
        pricelabs_listing_id: null,
        pricelabs_status: 'pending_connection',
        pricelabs_synced_at: new Date().toISOString(),
      })
      .eq('id', propertyId);
    return 'pending_connection';
  }

  // The unique index on pricelabs_listing_id is the real guard: if another
  // property already claims this listing, the write fails and we stay pending
  // rather than pointing two customers at one remote listing.
  const { error } = await supabase
    .from('properties')
    .update({
      pricelabs_listing_id: hit.listing_id,
      pricelabs_pms: hit.pms_name || 'hospitable',
      pricelabs_status: 'connected',
      pricelabs_synced_at: new Date().toISOString(),
    })
    .eq('id', propertyId);
  return error ? 'pending_connection' : 'connected';
}
