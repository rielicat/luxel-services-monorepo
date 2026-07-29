'use server';

import { z } from 'zod';
import nodeCrypto from 'node:crypto';
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

/** Who runs the turnovers: Luxel's crew, or the host's own people (managed as
 *  a notify list via add/removeCleaningContact). */
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

const ContactSchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string().max(120).optional(),
  email: z.union([z.string().email().max(120), z.literal('')]).optional(),
  whatsapp: z.string().max(30).optional(),
});

export async function addCleaningContact(
  input: unknown,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const p = ContactSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'validation' };
  const email = p.data.email?.trim() || null;
  const whatsapp = p.data.whatsapp?.trim() || null;
  // Notifications go out by email — a contact without one would silently
  // never be notified while the UI claims "equipo avisado".
  if (!email) return { ok: false, error: 'email_required' };
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, p.data.propertyId))) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('cleaning_contacts')
    .insert({
      property_id: p.data.propertyId,
      name: p.data.name?.trim() || null,
      email,
      whatsapp,
    })
    .select('id')
    .single();
  if (error) return { ok: false };
  revalidatePath('/properties');
  return { ok: true, id: data.id as string };
}

export async function removeCleaningContact(input: unknown): Promise<{ ok: boolean }> {
  const p = z
    .object({ propertyId: z.string().uuid(), contactId: z.string().uuid() })
    .safeParse(input);
  if (!p.success) return { ok: false };
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, p.data.propertyId))) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  await supabase
    .from('cleaning_contacts')
    .delete()
    .eq('id', p.data.contactId)
    .eq('property_id', p.data.propertyId);

  // The removed person still holds confirm links for pending cleanings —
  // rotate those tokens (killing their links) and re-notify whoever remains.
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

  revalidatePath('/properties');
  return { ok: true };
}

const StatusSchema = z.object({
  cleaningId: z.string().uuid(),
  status: z.enum(['scheduled', 'skipped', 'done']),
});

/** Confirming a cleaning notifies whoever runs it — automatically. The host's
 *  own staff get an email (with a WhatsApp deep link when we have their
 *  number); Luxel-managed turnovers ping the ops bridge and are already visible
 *  in the crew panel. Notification is best-effort and never blocks the status
 *  change. */
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
