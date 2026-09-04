import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { hospitablePlugin } from './hospitable-plugin';

export interface SyncAllResult {
  accounts: number;
  failed: number;
  reservations: number;
  replies: number;
}

export async function syncAllConnectedAccounts(now: Date = new Date()): Promise<SyncAllResult> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('channel_connections')
    .select('customer_id')
    .eq('provider', 'hospitable')
    .eq('status', 'connected');
  const customerIds = [
    ...new Set(((data ?? []) as { customer_id: string }[]).map((r) => r.customer_id)),
  ];

  const result: SyncAllResult = { accounts: 0, failed: 0, reservations: 0, replies: 0 };
  for (const customerId of customerIds) {
    const access = await hospitablePlugin.access(customerId);
    if (!access) {
      result.failed += 1;
      continue;
    }
    try {
      const r = await hospitablePlugin.sync(customerId, access, now);
      result.accounts += 1;
      if (!r.ok) result.failed += 1;
      result.reservations += r.reservations;
      result.replies += r.replies;
    } catch (err) {
      result.failed += 1;
      console.error('sync.account_failed', {
        customerId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return result;
}
