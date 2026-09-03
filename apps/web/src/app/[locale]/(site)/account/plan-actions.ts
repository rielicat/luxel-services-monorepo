'use server';

import { revalidatePath } from 'next/cache';
import { currentCustomerId } from '@/lib/host/owner';
import { getPlan, requestPlan, cancelPlan } from '@/lib/plans';
import { capture } from '@/lib/analytics/server';
import { ACTORS, EVENTS } from '@/lib/analytics/events';

export async function requestMyPlan(): Promise<{ ok: boolean }> {
  const cid = await currentCustomerId();
  if (!cid) return { ok: false };
  const ok = await requestPlan(cid);
  if (ok) {
    await capture(
      EVENTS.PLAN_REQUESTED,
      cid,
      { plan: 'commission', actor: ACTORS.HOST },
      { customerId: cid },
    );
  }
  revalidatePath('/account');
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
  revalidatePath('/account');
  return { ok };
}
