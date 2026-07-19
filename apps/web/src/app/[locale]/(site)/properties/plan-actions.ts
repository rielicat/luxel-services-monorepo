'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { currentCustomerId } from '@/lib/host/owner';
import { startTrial, cancelPlan, extendTrial, activatePlan } from '@/lib/plans';
import { devMockPaymentsEnabled } from '@/lib/payments/dev-mock';

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

/** Activate paid billing. Dev-mock simulates the MercadoPago preapproval so the
 *  trial→active transition is testable; real billing needs the preapproval flow. */
export async function activateMyPlan(): Promise<{ ok: boolean; reason?: string }> {
  const cid = await currentCustomerId();
  if (!cid) return { ok: false };
  if (!devMockPaymentsEnabled('mercadopago'))
    return { ok: false, reason: 'billing_not_configured' };
  const ok = await activatePlan(cid);
  revalidatePath('/properties');
  return { ok };
}
