'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { currentCustomerId } from '@luxel/core/host/owner';
import { claimAirbnbEmail, verifyConnection } from '@luxel/core/channels/connection';

export type ConnectError = 'validation' | 'auth' | 'store' | 'check';

const EmailSchema = z.object({ email: z.string().trim().min(5).max(320).email() });

export async function submitAirbnbEmail(
  input: unknown,
): Promise<{ ok: boolean; error?: ConnectError }> {
  const parsed = EmailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const customerId = await currentCustomerId();
  if (!customerId) return { ok: false, error: 'auth' };

  const result = await claimAirbnbEmail(customerId, parsed.data.email);
  revalidatePath('/properties');
  if (result.ok) return { ok: true };

  if (result.error === 'invalid_email') return { ok: false, error: 'validation' };
  if (result.error === 'unknown_customer') return { ok: false, error: 'auth' };
  return { ok: false, error: 'store' };
}

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
