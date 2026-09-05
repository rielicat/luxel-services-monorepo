'use server';

import { revalidatePath } from 'next/cache';
import { currentCustomerId } from '@luxel/core/host/owner';
import { verifyConnection } from '@luxel/core/channels/connection';
import { requestConnection } from '@luxel/core/channels/onboarding-queue';

export type ConnectError = 'validation' | 'auth' | 'store' | 'check';

export async function checkConnection(): Promise<{
  ok: boolean;
  connected: boolean;
  error?: ConnectError;
}> {
  const customerId = await currentCustomerId();
  if (!customerId) return { ok: false, connected: false, error: 'auth' };

  const result = await verifyConnection(customerId);
  revalidatePath('/properties');
  if (!result.ok) return { ok: false, connected: false, error: 'check' };
  return { ok: true, connected: result.outcome === 'connected' };
}

export async function askForConnection(): Promise<{ ok: boolean; error?: ConnectError }> {
  const customerId = await currentCustomerId();
  if (!customerId) return { ok: false, error: 'auth' };
  const ok = await requestConnection(customerId);
  revalidatePath('/properties');
  return ok ? { ok: true } : { ok: false, error: 'store' };
}
