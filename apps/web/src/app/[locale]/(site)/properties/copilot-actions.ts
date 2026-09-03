'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { messages } from '@luxel/shared/i18n';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { currentCustomerId, ownsProperty } from '@/lib/host/owner';

const CONTEXT_FIELDS = [
  'wifi',
  'devices',
  'arrival',
  'parking',
  'warnings',
  'recommend',
  'notes',
] as const;

const FIELD_MAX = 400;

const answer = z.string().max(FIELD_MAX).optional();

const contextInput = z.object({
  propertyId: z.string().uuid(),
  answers: z.object({
    wifi: answer,
    devices: answer,
    arrival: answer,
    parking: answer,
    warnings: answer,
    recommend: answer,
    notes: answer,
  }),
});

export async function updatePropertyContext(input: unknown): Promise<{ ok: boolean }> {
  const p = contextInput.safeParse(input);
  if (!p.success) return { ok: false };
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, p.data.propertyId))) return { ok: false };

  const copy = messages.context;
  const kept: Record<string, string> = {};
  const lines: string[] = [];
  for (const field of CONTEXT_FIELDS) {
    const value = (p.data.answers[field] ?? '').trim();
    if (!value) continue;
    kept[field] = value;
    lines.push(`${copy[`line_${field}`]}: ${value}`);
  }
  const filled = lines.length > 0;

  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('properties')
    .update({
      guest_info: filled ? lines.join('\n') : null,
      guest_context: filled ? kept : null,
    })
    .eq('id', p.data.propertyId);
  if (error) {
    console.error('context.save_failed', { propertyId: p.data.propertyId, error: error.message });
    return { ok: false };
  }
  revalidatePath('/properties');
  return { ok: true };
}
