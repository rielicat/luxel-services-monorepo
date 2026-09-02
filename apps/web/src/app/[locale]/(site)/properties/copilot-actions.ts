'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { currentCustomerId, ownsProperty } from '@/lib/host/owner';

export async function setPriceOptimization(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const p = z.object({ propertyId: z.string().uuid(), enabled: z.boolean() }).safeParse(input);
  if (!p.success) return { ok: false, error: 'validation' };
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, p.data.propertyId))) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  await supabase
    .from('properties')
    .update({ price_optimization_enabled: p.data.enabled })
    .eq('id', p.data.propertyId);
  revalidatePath('/properties');
  return { ok: true };
}

export async function updateGuestInfo(input: unknown): Promise<{ ok: boolean }> {
  const p = z
    .object({ propertyId: z.string().uuid(), guestInfo: z.string().max(4000) })
    .safeParse(input);
  if (!p.success) return { ok: false };
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, p.data.propertyId))) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  await supabase
    .from('properties')
    .update({ guest_info: p.data.guestInfo })
    .eq('id', p.data.propertyId);
  revalidatePath('/properties');
  return { ok: true };
}
