'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { currentCustomerId } from '@/lib/host/owner';
import { requestPlan, cancelPlan } from '@/lib/plans';
import { PLAN_KEYS } from '@/lib/plan-pricing';

export async function requestMyPlan(input: unknown): Promise<{ ok: boolean }> {
  const p = z.object({ plan: z.enum(PLAN_KEYS) }).safeParse(input);
  if (!p.success) return { ok: false };
  const cid = await currentCustomerId();
  if (!cid) return { ok: false };
  const ok = await requestPlan(cid, p.data.plan);
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
