'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { currentCustomerId, ownsProperty } from '@/lib/host/owner';
import { getMessageSender } from '@/lib/channels/provider';
import { hospitableTokenForCustomer } from '@/lib/channels/hospitable';
import { handleInboundMessage } from '@/lib/channels/pipeline';
import { devMockEnabled } from '@/lib/dev-mock';

export async function simulateInbound(input: unknown): Promise<{ ok: boolean; action?: string }> {
  const p = z
    .object({
      propertyId: z.string().uuid(),
      guestName: z.string().max(120).optional(),
      body: z.string().min(1).max(2000),
    })
    .safeParse(input);
  if (!p.success || !devMockEnabled()) return { ok: false };
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, p.data.propertyId))) return { ok: false };
  const r = await handleInboundMessage({
    propertyId: p.data.propertyId,
    channel: 'local',
    externalThreadId: `sim-${Date.now()}`,
    guestName: p.data.guestName,
    body: p.data.body,
  });
  revalidatePath('/properties');
  return { ok: r.ok, action: r.action };
}

async function threadForOwner(cid: string, threadId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data: t } = await supabase
    .from('guest_threads')
    .select('property_id, channel, external_thread_id')
    .eq('id', threadId)
    .maybeSingle();
  if (!t || !(await ownsProperty(cid, t.property_id))) return null;
  return t;
}

export async function hostReply(input: unknown): Promise<{ ok: boolean }> {
  const p = z
    .object({ threadId: z.string().uuid(), body: z.string().min(1).max(2000) })
    .safeParse(input);
  if (!p.success) return { ok: false };
  const cid = await currentCustomerId();
  if (!cid) return { ok: false };
  const t = await threadForOwner(cid, p.data.threadId);
  if (!t) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  const token = t.channel === 'hospitable' ? await hospitableTokenForCustomer(cid) : null;
  const extId = await getMessageSender(t.channel).send(t.external_thread_id, p.data.body, {
    token,
  });
  if (!extId) return { ok: false };
  await supabase.from('guest_messages').insert({
    thread_id: p.data.threadId,
    direction: 'out',
    source: 'host',
    body: p.data.body,
    external_id: extId,
  });
  await supabase
    .from('guest_threads')
    .update({ status: 'open', updated_at: new Date().toISOString() })
    .eq('id', p.data.threadId);
  revalidatePath('/properties');
  return { ok: true };
}

export async function saveLearnedAnswer(input: unknown): Promise<{ ok: boolean }> {
  const p = z
    .object({
      propertyId: z.string().uuid(),
      question: z.string().min(1).max(500),
      answer: z.string().min(1).max(2000),
    })
    .safeParse(input);
  if (!p.success) return { ok: false };
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, p.data.propertyId))) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  await supabase
    .from('learned_answers')
    .insert({ property_id: p.data.propertyId, question: p.data.question, answer: p.data.answer });
  revalidatePath('/properties');
  return { ok: true };
}
