'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { currentCustomerId, ownsProperty } from '@/lib/host/owner';
import { suggestCleaningsFromCheckouts } from '@/lib/cleaning/schedule';
import { priceTurnover } from '@/lib/cleaning/price';

export async function refreshCleanings(
  propertyId: string,
): Promise<{ ok: boolean; suggested?: number }> {
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, propertyId))) return { ok: false };
  const r = await suggestCleaningsFromCheckouts(propertyId);
  revalidatePath('/properties');
  return { ok: true, suggested: r.suggested };
}

export async function getTurnoverPrice(
  propertyId: string,
): Promise<{ ok: boolean; priceClp?: number; error?: string }> {
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, propertyId))) return { ok: false };
  const r = await priceTurnover(propertyId);
  return 'priceClp' in r ? { ok: true, priceClp: r.priceClp } : { ok: true, error: r.error };
}

const StatusSchema = z.object({
  cleaningId: z.string().uuid(),
  status: z.enum(['scheduled', 'skipped', 'done']),
});

export async function setCleaningStatus(input: unknown): Promise<{ ok: boolean }> {
  const p = StatusSchema.safeParse(input);
  if (!p.success) return { ok: false };
  const cid = await currentCustomerId();
  if (!cid) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  const { data: cleaning } = await supabase
    .from('cleanings')
    .select('property_id')
    .eq('id', p.data.cleaningId)
    .maybeSingle();
  if (!cleaning || !(await ownsProperty(cid, cleaning.property_id))) return { ok: false };
  await supabase.from('cleanings').update({ status: p.data.status }).eq('id', p.data.cleaningId);
  revalidatePath('/properties');
  return { ok: true };
}
