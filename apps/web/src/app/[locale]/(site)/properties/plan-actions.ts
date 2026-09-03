'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { currentCustomerId } from '@/lib/host/owner';
import { getPlan, requestPlan, cancelPlan } from '@/lib/plans';
import { PLAN_KEYS } from '@/lib/plan-pricing';
import { capture } from '@/lib/analytics/server';
import { ACTORS, EVENTS } from '@/lib/analytics/events';

export async function requestMyPlan(input: unknown): Promise<{ ok: boolean }> {
  const p = z.object({ plan: z.enum(PLAN_KEYS) }).safeParse(input);
  if (!p.success) return { ok: false };
  const cid = await currentCustomerId();
  if (!cid) return { ok: false };
  const ok = await requestPlan(cid, p.data.plan);
  if (ok) {
    await capture(
      EVENTS.PLAN_REQUESTED,
      cid,
      { plan: p.data.plan, actor: ACTORS.HOST },
      { customerId: cid },
    );
  }
  revalidatePath('/properties');
  return { ok };
}

export async function cancelMyPlan(): Promise<{ ok: boolean }> {
  const cid = await currentCustomerId();
  if (!cid) return { ok: false };
  const current = await getPlan(cid);
  const ok = await cancelPlan(cid);
  if (ok) {
    await capture(
      EVENTS.PLAN_CANCELLED,
      cid,
      { plan: current?.plan ?? null, actor: ACTORS.HOST },
      { customerId: cid },
    );
  }
  revalidatePath('/properties');
  return { ok };
}
