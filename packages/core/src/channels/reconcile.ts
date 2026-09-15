import 'server-only';
import type { ChannelReconcileResult } from '@luxel/shared/channel-reconcile';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { channelPlugin } from './registry';

export async function reconcileChannels(now: Date = new Date()): Promise<ChannelReconcileResult> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('channel_connections')
    .select('customer_id, provider')
    .eq('status', 'connected');
  if (error) {
    console.error('channels.reconcile_list_failed', { message: error.message });
    return { ok: false, connections: 0, properties: 0, created: 0, failed: 0 };
  }

  const rows = data ?? [];
  let properties = 0;
  let created = 0;
  let failed = 0;

  for (const row of rows) {
    const provider = String(row.provider ?? '');
    const customerId = String(row.customer_id ?? '');
    const plugin = channelPlugin(provider);
    if (!plugin?.reconcileCheckins || !customerId) continue;
    try {
      const access = await plugin.access(customerId);
      if (!access) {
        failed++;
        console.error('channels.reconcile_no_access', { provider, customerId });
        continue;
      }
      const outcome = await plugin.reconcileCheckins(customerId, access, now);
      properties += outcome.properties;
      created += outcome.created;
      if (!outcome.ok) failed++;
    } catch (err) {
      failed++;
      console.error('channels.reconcile_threw', {
        provider,
        customerId,
        message: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  return { ok: failed === 0, connections: rows.length, properties, created, failed };
}
