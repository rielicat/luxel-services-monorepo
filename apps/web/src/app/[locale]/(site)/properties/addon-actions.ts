'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { currentCustomerId, ownsProperty } from '@/lib/host/owner';
import { activateAddon, cancelAddon, isAddonActive, hasPricelabsAddon } from '@/lib/addons/store';
import { ADDON_KEYS, ADDONS } from '@/lib/addons/catalog';

const Schema = z.object({
  propertyId: z.string().uuid(),
  addon: z.enum(ADDON_KEYS),
});

export async function subscribeAddon(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const p = Schema.safeParse(input);
  if (!p.success) return { ok: false, error: 'validation' };
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, p.data.propertyId))) return { ok: false };
  if (await isAddonActive(p.data.propertyId, p.data.addon)) return { ok: true };

  if (!(await activateAddon(p.data.propertyId, p.data.addon))) return { ok: false, error: 'store' };

  const supabase = createSupabaseServiceRoleClient();
  if (ADDONS[p.data.addon].needsPricelabs) {
    await supabase
      .from('properties')
      .update({ pricelabs_status: 'pending_connection' })
      .eq('id', p.data.propertyId);
  }
  if (p.data.addon === 'dynamic_pricing') {
    await supabase
      .from('properties')
      .update({ price_optimization_enabled: true })
      .eq('id', p.data.propertyId);
  }
  revalidatePath('/properties');
  return { ok: true };
}

export async function markPricelabsConnected(input: unknown): Promise<{ ok: boolean }> {
  const p = z.object({ propertyId: z.string().uuid(), connected: z.boolean() }).safeParse(input);
  if (!p.success) return { ok: false };
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, p.data.propertyId))) return { ok: false };
  if (!(await hasPricelabsAddon(p.data.propertyId))) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  await supabase
    .from('properties')
    .update({ pricelabs_status: p.data.connected ? 'connected' : 'pending_connection' })
    .eq('id', p.data.propertyId);
  revalidatePath('/properties');
  return { ok: true };
}

export async function unsubscribeAddon(input: unknown): Promise<{ ok: boolean }> {
  const p = Schema.safeParse(input);
  if (!p.success) return { ok: false };
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, p.data.propertyId))) return { ok: false };

  if (!(await cancelAddon(p.data.propertyId, p.data.addon))) return { ok: false };

  const supabase = createSupabaseServiceRoleClient();
  if (p.data.addon === 'dynamic_pricing') {
    await supabase
      .from('properties')
      .update({ price_optimization_enabled: false })
      .eq('id', p.data.propertyId);
  }
  if (!(await hasPricelabsAddon(p.data.propertyId))) {
    await supabase
      .from('properties')
      .update({ pricelabs_status: 'off' })
      .eq('id', p.data.propertyId);
  }
  revalidatePath('/properties');
  return { ok: true };
}
