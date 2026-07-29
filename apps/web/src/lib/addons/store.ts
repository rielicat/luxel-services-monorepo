import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { ADDONS, ADDON_KEYS, type AddonKey } from './catalog';

export type PropertyAddon = {
  addon: AddonKey;
  status: 'active' | 'cancelled';
  price_clp: number;
  activated_at: string;
};

export async function listPropertyAddons(propertyId: string): Promise<PropertyAddon[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('property_addons')
    .select('addon, status, price_clp, activated_at')
    .eq('property_id', propertyId);
  return (data ?? []) as PropertyAddon[];
}

export async function isAddonActive(propertyId: string, addon: AddonKey): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('property_addons')
    .select('status')
    .eq('property_id', propertyId)
    .eq('addon', addon)
    .maybeSingle();
  return data?.status === 'active';
}

/** Whether the listing has any live add-on that depends on the host's
 *  PriceLabs authorisation — the handshake only matters while one is active. */
export async function hasPricelabsAddon(propertyId: string): Promise<boolean> {
  const keys = ADDON_KEYS.filter((k) => ADDONS[k].needsPricelabs);
  if (!keys.length) return false;
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('property_addons')
    .select('addon')
    .eq('property_id', propertyId)
    .eq('status', 'active')
    .in('addon', keys);
  return (data?.length ?? 0) > 0;
}

/** Activating snapshots today's catalogue price, so a later price change never
 *  silently reprices a listing the host already signed up. Re-activating a
 *  cancelled add-on re-snapshots at the current price. */
export async function activateAddon(propertyId: string, addon: AddonKey): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('property_addons').upsert(
    {
      property_id: propertyId,
      addon,
      status: 'active',
      price_clp: ADDONS[addon].priceClp,
      activated_at: new Date().toISOString(),
      cancelled_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'property_id,addon' },
  );
  return !error;
}

export async function cancelAddon(propertyId: string, addon: AddonKey): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('property_addons')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('property_id', propertyId)
    .eq('addon', addon);
  return !error;
}
