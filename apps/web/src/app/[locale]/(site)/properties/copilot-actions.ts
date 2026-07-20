'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { currentCustomerId, ownsProperty } from '@/lib/host/owner';
import { draftGuestReply, type Draft } from '@/lib/ai/copilot';
import { buildGrounding } from '@/lib/ai/grounding';

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

export async function draftReply(input: unknown): Promise<Draft> {
  const p = z
    .object({ propertyId: z.string().uuid(), guestMessage: z.string().min(1).max(2000) })
    .safeParse(input);
  if (!p.success) return { ok: false, reason: 'error' };
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, p.data.propertyId))) return { ok: false, reason: 'error' };
  const grounding = await buildGrounding(p.data.propertyId);
  return draftGuestReply(p.data.propertyId, p.data.guestMessage, { history: grounding.text });
}
