'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { currentCustomerId } from '@luxel/core/host/owner';
import { verifyHospitableToken, saveHospitableConnection } from '@luxel/core/channels/hospitable';
import { syncHospitableAccount } from '@luxel/core/channels/hospitable-sync';

export async function connectHospitable(
  input: unknown,
): Promise<{ ok: boolean; error?: string; properties?: number }> {
  const p = z.object({ token: z.string().min(20).max(4000) }).safeParse(input);
  if (!p.success) return { ok: false, error: 'validation' };
  const cid = await currentCustomerId();
  if (!cid) return { ok: false, error: 'auth' };

  const verify = await verifyHospitableToken(p.data.token.trim());
  if (!verify.ok) return { ok: false, error: 'invalid_token' };

  const saved = await saveHospitableConnection(cid, p.data.token.trim(), verify.firstName ?? null);
  if (!saved) return { ok: false, error: 'store' };

  const sync = await syncHospitableAccount(cid, p.data.token.trim());
  revalidatePath('/properties');
  return { ok: true, properties: sync.properties };
}
