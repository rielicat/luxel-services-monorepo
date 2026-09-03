import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { decryptPII } from '../crypto/pii';
import { operatorCredentials, providerApiKey } from './credentials';
import { deletablePropertyIds } from './manual-stays';
import type { ChannelAccess, ChannelScope } from './types';

export type { ChannelAccess, ChannelScope };

async function ownConnectionToken(customerId: string): Promise<string | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('channel_connections')
    .select('token_enc')
    .eq('customer_id', customerId)
    .eq('provider', 'hospitable')
    .eq('status', 'connected')
    .maybeSingle();
  if (!data?.token_enc) return null;
  try {
    return decryptPII(data.token_enc as string);
  } catch {
    return null;
  }
}

export async function hospitableAccess(customerId: string): Promise<ChannelAccess | null> {
  const central = providerApiKey();
  const own = await ownConnectionToken(customerId);
  const operator = new Set(operatorCredentials());
  if (own && !operator.has(own)) return { token: own, scope: 'own' };
  if (!central) return null;
  const assigned = await allowedListingIds(customerId);
  return assigned?.length ? { token: central, scope: 'central' } : null;
}

export async function allowedListingIds(customerId: string): Promise<string[] | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('listing_assignments')
    .select('external_listing_id')
    .eq('customer_id', customerId);
  if (error) return null;
  return (data ?? []).map((r) => r.external_listing_id as string);
}

export async function customerForListing(externalListingId: string): Promise<string | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('listing_assignments')
    .select('customer_id')
    .eq('external_listing_id', externalListingId)
    .maybeSingle();
  return (data?.customer_id as string | undefined) ?? null;
}

export async function unassignedListingIds(remoteIds: string[]): Promise<string[] | null> {
  if (!remoteIds.length) return [];
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('listing_assignments')
    .select('external_listing_id')
    .in('external_listing_id', remoteIds);
  if (error) return null;
  const taken = new Set((data ?? []).map((r) => r.external_listing_id as string));
  return remoteIds.filter((id) => !taken.has(id));
}

export async function claimListing(externalListingId: string, customerId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  await supabase.from('listing_assignments').upsert(
    {
      external_listing_id: externalListingId,
      customer_id: customerId,
      assigned_at: new Date().toISOString(),
      assigned_by: 'own_token_import',
    },
    { onConflict: 'external_listing_id', ignoreDuplicates: true },
  );
}

export async function assignListing(
  externalListingId: string,
  customerId: string,
  assignedBy: string,
  expectedOwnerId: string | null,
): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const row = {
    external_listing_id: externalListingId,
    customer_id: customerId,
    assigned_at: new Date().toISOString(),
    assigned_by: assignedBy,
  };

  if (expectedOwnerId === null) {
    const { error } = await supabase.from('listing_assignments').insert(row);
    if (error) return false;
  } else {
    const { data, error } = await supabase
      .from('listing_assignments')
      .update(row)
      .eq('external_listing_id', externalListingId)
      .eq('customer_id', expectedOwnerId)
      .select('external_listing_id');
    if (error || !data?.length) return false;
  }

  const { data: strays } = await supabase
    .from('properties')
    .select('id')
    .eq('external_listing_id', externalListingId)
    .neq('owner_id', customerId);
  const removable = await deletablePropertyIds(
    supabase,
    (strays ?? []).map((p) => p.id as string),
    { externalListingId, reason: 'assign' },
  );
  if (removable.length) await supabase.from('properties').delete().in('id', removable);
  return true;
}

export async function unassignListing(
  externalListingId: string,
  expectedCustomerId: string,
): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('listing_assignments')
    .delete()
    .eq('external_listing_id', externalListingId)
    .eq('customer_id', expectedCustomerId)
    .select('external_listing_id');
  if (error || !data?.length) return false;
  const { data: owned } = await supabase
    .from('properties')
    .select('id')
    .eq('external_listing_id', externalListingId)
    .eq('owner_id', expectedCustomerId);
  const removable = await deletablePropertyIds(
    supabase,
    (owned ?? []).map((p) => p.id as string),
    { externalListingId, reason: 'unassign' },
  );
  if (removable.length) await supabase.from('properties').delete().in('id', removable);
  return true;
}
