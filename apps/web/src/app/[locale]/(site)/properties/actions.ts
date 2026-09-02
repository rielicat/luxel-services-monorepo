'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { currentCustomerId, ownsProperty } from '@/lib/host/owner';

const AccessSchema = z.object({
  propertyId: z.string().uuid(),
  method: z.enum(['keyless', 'physical_concierge', 'physical_none']),
  keylessCode: z.string().max(60).optional(),
  keylessInstructions: z.string().max(500).optional(),
  conciergeName: z.string().max(120).optional(),
  conciergeHours: z.string().max(120).optional(),
  unit: z.string().max(20).optional(),
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
      concierge_hours: parsed.data.conciergeHours ?? null,
      unit: parsed.data.unit?.trim() || null,
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
