'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { currentCustomerId } from '@/lib/host/owner';
import { startTrial, cancelPlan, extendTrial } from '@/lib/plans';

export async function startPlan(input: unknown): Promise<{ ok: boolean }> {
  const p = z.object({ plan: z.enum(['ai', 'ai_cleaning']) }).safeParse(input);
  if (!p.success) return { ok: false };
  const cid = await currentCustomerId();
  if (!cid) return { ok: false };
  const ok = await startTrial(cid, p.data.plan);
  revalidatePath('/properties');
  return { ok };
}

export async function cancelMyPlan(): Promise<{ ok: boolean }> {
  const cid = await currentCustomerId();
  if (!cid) return { ok: false };
  const ok = await cancelPlan(cid);
  revalidatePath('/properties');
  return { ok };
}

export async function extendMyTrial(): Promise<{ ok: boolean }> {
  const cid = await currentCustomerId();
  if (!cid) return { ok: false };
  const ok = await extendTrial(cid);
  revalidatePath('/properties');
  return { ok };
}
