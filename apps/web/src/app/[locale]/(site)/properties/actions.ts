'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { checkinToken } from '@/lib/checkin/tokens';
import { currentCustomerId, ownsProperty } from '@/lib/host/owner';

const PropertySchema = z.object({
  nickname: z.string().min(1).max(120),
  address: z.string().max(200).optional(),
  comuna: z.string().max(80).optional(),
  bedrooms: z.number().int().min(0).max(50).optional(),
  bathrooms: z.number().int().min(0).max(50).optional(),
  sizeM2: z.number().positive().max(5000).optional(),
});

export async function createProperty(input: unknown): Promise<{ ok: boolean; id?: string }> {
  const parsed = PropertySchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const customerId = await currentCustomerId();
  if (!customerId) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('properties')
    .insert({
      owner_id: customerId,
      nickname: parsed.data.nickname,
      address: parsed.data.address ?? null,
      comuna: parsed.data.comuna ?? null,
      bedrooms: parsed.data.bedrooms ?? null,
      bathrooms: parsed.data.bathrooms ?? null,
      size_m2: parsed.data.sizeM2 ?? null,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false };
  await supabase.from('property_access').insert({ property_id: data.id, method: 'physical_none' });
  revalidatePath('/properties');
  return { ok: true, id: data.id };
}

const AccessSchema = z.object({
  propertyId: z.string().uuid(),
  method: z.enum(['keyless', 'physical_concierge', 'physical_none']),
  keylessCode: z.string().max(60).optional(),
  keylessInstructions: z.string().max(500).optional(),
  conciergeName: z.string().max(120).optional(),
  conciergeWhatsapp: z.string().max(30).optional(),
  conciergeEmail: z.union([z.string().email().max(120), z.literal('')]).optional(),
  conciergeHours: z.string().max(120).optional(),
  requireId: z.boolean().optional(),
  idBasis: z.string().max(300).optional(),
  idDisclosed: z.boolean().optional(),
});

export async function updateAccess(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = AccessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const customerId = await currentCustomerId();
  if (!customerId || !(await ownsProperty(customerId, parsed.data.propertyId))) {
    return { ok: false, error: 'forbidden' };
  }
  // ID may only be REQUIRED when the host affirms a legal/compliance basis AND
  // that it's disclosed in the listing — the AirBnB-policy gate, enforced here.
  const requireId = Boolean(
    parsed.data.requireId && parsed.data.idDisclosed && parsed.data.idBasis?.trim(),
  );
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('property_access').upsert(
    {
      property_id: parsed.data.propertyId,
      method: parsed.data.method,
      keyless_code: parsed.data.keylessCode ?? null,
      keyless_instructions: parsed.data.keylessInstructions ?? null,
      concierge_name: parsed.data.conciergeName ?? null,
      concierge_whatsapp: parsed.data.conciergeWhatsapp ?? null,
      concierge_email: parsed.data.conciergeEmail || null,
      concierge_hours: parsed.data.conciergeHours ?? null,
      require_id: requireId,
      id_basis: parsed.data.idBasis ?? null,
      id_disclosed: Boolean(parsed.data.idDisclosed),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'property_id' },
  );
  if (error) return { ok: false, error: 'store' };
  revalidatePath('/properties');
  return { ok: true };
}

export async function createCheckinLink(
  propertyId: string,
): Promise<{ ok: boolean; token?: string }> {
  if (typeof propertyId !== 'string') return { ok: false };
  const customerId = await currentCustomerId();
  if (!customerId || !(await ownsProperty(customerId, propertyId))) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  const token = checkinToken();
  const { error } = await supabase
    .from('checkins')
    .insert({ property_id: propertyId, token, status: 'pending' });
  if (error) return { ok: false };
  revalidatePath('/properties');
  return { ok: true, token };
}
