import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { ownsProperty } from '@/lib/host/owner';
import { listPricelabsListings, pricelabsConfigured, type PricelabsRef } from './client';

export async function resolvePricelabsRef(
  customerId: string,
  propertyId: string,
): Promise<PricelabsRef | null> {
  if (!(await ownsProperty(customerId, propertyId))) return null;
  const supabase = createSupabaseServiceRoleClient();
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
  if (!remote || !remote.length) return 'unavailable';

  const hit = remote.find((l) => matches(l, external));
  if (!hit) {
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
