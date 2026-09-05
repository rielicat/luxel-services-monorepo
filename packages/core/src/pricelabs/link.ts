import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { ownsProperty } from '../host/owner';
import type { PricelabsRef } from './client';

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
