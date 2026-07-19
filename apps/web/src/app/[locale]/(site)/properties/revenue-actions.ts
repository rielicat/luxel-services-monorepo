'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { currentCustomerId, ownsProperty } from '@/lib/host/owner';
import { suggestPricing, type RevenueInsight } from '@/lib/revenue/suggest';
import { runAgentCommand } from '@/lib/agent/router';

export async function getPricingSuggestions(
  propertyId: string,
): Promise<{ ok: boolean; insight?: RevenueInsight }> {
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, propertyId))) return { ok: false };
  return { ok: true, insight: await suggestPricing(propertyId) };
}

export async function askAgent(
  input: unknown,
): Promise<{ ok: boolean; text?: string; intent?: string }> {
  const p = z
    .object({ propertyId: z.string().uuid(), command: z.string().min(1).max(500) })
    .safeParse(input);
  if (!p.success) return { ok: false };
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, p.data.propertyId))) return { ok: false };
  const r = await runAgentCommand(p.data.propertyId, p.data.command);
  revalidatePath('/properties');
  return { ok: true, text: r.text, intent: r.intent };
}
