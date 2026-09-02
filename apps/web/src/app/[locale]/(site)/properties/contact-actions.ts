'use server';

import { z } from 'zod';
import nodeCrypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { currentCustomerId, ownsProperty } from '@/lib/host/owner';
import { notifyCleaningScheduled } from '@/lib/cleaning/notify';
import { toE164Digits } from '@/lib/phone';

const ContactSchema = z.object({
  propertyId: z.string().uuid(),
  role: z.enum(['cleaning', 'concierge']),
  name: z.string().max(120).optional(),
  whatsapp: z.string().max(40),
  email: z.union([z.string().email().max(120), z.literal('')]).optional(),
});

export async function addPropertyContact(
  input: unknown,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const p = ContactSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'validation' };
  const digits = toE164Digits(p.data.whatsapp);
  if (!digits) return { ok: false, error: 'whatsapp_invalid' };
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, p.data.propertyId)))
    return { ok: false, error: 'forbidden' };
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('property_contacts')
    .insert({
      property_id: p.data.propertyId,
      role: p.data.role,
      name: p.data.name?.trim() || null,
      whatsapp: `+${digits}`,
      email: p.data.email?.trim() || null,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: 'store' };
  revalidatePath('/properties');
  return { ok: true, id: data.id as string };
}

export async function removePropertyContact(input: unknown): Promise<{ ok: boolean }> {
  const p = z
    .object({ propertyId: z.string().uuid(), contactId: z.string().uuid() })
    .safeParse(input);
  if (!p.success) return { ok: false };
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, p.data.propertyId))) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  const { data: removed } = await supabase
    .from('property_contacts')
    .delete()
    .eq('id', p.data.contactId)
    .eq('property_id', p.data.propertyId)
    .select('role')
    .maybeSingle();

  if (removed?.role === 'cleaning') {
    const { data: pendingRows } = await supabase
      .from('cleanings')
      .select('id')
      .eq('property_id', p.data.propertyId)
      .eq('status', 'scheduled')
      .is('crew_confirmed_at', null);
    for (const row of pendingRows ?? []) {
      await supabase
        .from('cleanings')
        .update({ confirm_token: nodeCrypto.randomUUID() })
        .eq('id', row.id);
      await notifyCleaningScheduled(supabase, p.data.propertyId, row.id as string);
    }
  }

  revalidatePath('/properties');
  return { ok: true };
}
