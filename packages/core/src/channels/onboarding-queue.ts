import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { recordEvent } from '../analytics/store';
import { getHostConnection } from './connection';

export async function requestConnection(customerId: string): Promise<boolean> {
  const current = await getHostConnection(customerId);
  if (current && current.state !== 'not_started') return true;

  const now = new Date().toISOString();
  const { error } = await createSupabaseServiceRoleClient()
    .from('host_connection')
    .upsert(
      { customer_id: customerId, state: 'not_started', requested_at: now, updated_at: now },
      { onConflict: 'customer_id' },
    );
  if (error) {
    console.error('onboarding.request_failed', { message: error.message });
    return false;
  }

  await recordEvent({
    event: 'host_connect_requested',
    customerId,
    distinctId: customerId,
    source: 'web',
  });
  return true;
}

export async function connectionRequestedAt(customerId: string): Promise<string | null> {
  const { data } = await createSupabaseServiceRoleClient()
    .from('host_connection')
    .select('requested_at')
    .eq('customer_id', customerId)
    .maybeSingle();
  return (data?.requested_at as string | null) ?? null;
}
