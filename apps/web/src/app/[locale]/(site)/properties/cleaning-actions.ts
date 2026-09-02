'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { currentCustomerId, ownsProperty } from '@/lib/host/owner';
import { priceTurnover } from '@/lib/cleaning/price';
import { notifyCleaningScheduled } from '@/lib/cleaning/notify';

export async function getTurnoverPrice(
  propertyId: string,
): Promise<{ ok: boolean; priceClp?: number; error?: string }> {
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, propertyId))) return { ok: false };
  const r = await priceTurnover(propertyId);
  return 'priceClp' in r ? { ok: true, priceClp: r.priceClp } : { ok: true, error: r.error };
}

const StaffSchema = z.object({
  propertyId: z.string().uuid(),
  managedBy: z.enum(['luxel', 'own']),
  autoConfirm: z.boolean().optional(),
});

export async function updateCleaningStaff(input: unknown): Promise<{ ok: boolean }> {
  const p = StaffSchema.safeParse(input);
  if (!p.success) return { ok: false };
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, p.data.propertyId))) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('properties')
    .update({
      cleaning_managed_by: p.data.managedBy,
      ...(p.data.autoConfirm != null ? { cleaning_auto_confirm: p.data.autoConfirm } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', p.data.propertyId);
  if (error) return { ok: false };
  revalidatePath('/properties');
  return { ok: true };
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
    .select('property_id, cleaning_date')
    .eq('id', p.data.cleaningId)
    .maybeSingle();
  if (!cleaning || !(await ownsProperty(cid, cleaning.property_id))) return { ok: false };
  await supabase.from('cleanings').update({ status: p.data.status }).eq('id', p.data.cleaningId);

  if (p.data.status === 'scheduled') {
    await notifyCleaningScheduled(supabase, cleaning.property_id, p.data.cleaningId);
  }

  revalidatePath('/properties');
  return { ok: true };
}
