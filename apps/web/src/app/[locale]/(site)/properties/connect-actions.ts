'use server';

import { revalidatePath } from 'next/cache';
import { currentCustomerId } from '@luxel/core/host/owner';
import { verifyConnection } from '@luxel/core/channels/connection';

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
