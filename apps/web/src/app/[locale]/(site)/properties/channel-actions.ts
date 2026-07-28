'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { currentCustomerId } from '@/lib/host/owner';
import {
  verifyHospitableToken,
  saveHospitableConnection,
  customerHospitableToken,
} from '@/lib/channels/hospitable';
import { syncHospitableAccount } from '@/lib/channels/hospitable-sync';

/** Connects the host's own Hospitable account: verifies the token against the
 *  live API, then stores it encrypted. Immediately runs a first sync. */
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

export async function disconnectHospitable(): Promise<{ ok: boolean }> {
  const cid = await currentCustomerId();
  if (!cid) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  await supabase
    .from('channel_connections')
    .delete()
    .eq('customer_id', cid)
    .eq('provider', 'hospitable');
  revalidatePath('/properties');
  return { ok: true };
}

export async function syncHospitable(): Promise<{
  ok: boolean;
  properties?: number;
  reservations?: number;
}> {
  const cid = await currentCustomerId();
  if (!cid) return { ok: false };
  // Own-connection token only — the manual Sync also prunes the mirror.
  const token = await customerHospitableToken(cid);
  if (!token) return { ok: false };
  const r = await syncHospitableAccount(cid, token);
  revalidatePath('/properties');
  return { ok: r.ok, properties: r.properties, reservations: r.reservations };
}
