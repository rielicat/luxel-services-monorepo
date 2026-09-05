import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { recordEvent } from '../analytics/store';
import { getHostConnection, recordInvite, type HostConnectionState } from './connection';

export const INVITE_QUEUE_LIMIT = 25;

export interface AwaitingHost {
  customerId: string;
  email: string;
  fullName: string | null;
  state: HostConnectionState | 'not_started';
  waitingSince: string;
}

type CustomerRow = { id: string; email: string; full_name: string | null; created_at: string };

export async function hostsAwaitingInvite(limit = INVITE_QUEUE_LIMIT): Promise<AwaitingHost[]> {
  const capped = Math.min(Math.max(limit, 1), INVITE_QUEUE_LIMIT);
  const supabase = createSupabaseServiceRoleClient();

  const [customersRes, connectionsRes, assignmentsRes] = await Promise.all([
    supabase
      .from('customers')
      .select('id, email, full_name, created_at')
      .order('created_at', { ascending: true })
      .limit(300),
    supabase.from('host_connection').select('customer_id, state').limit(500),
    supabase.from('listing_assignments').select('customer_id').limit(1000),
  ]);

  if (customersRes.error || connectionsRes.error || assignmentsRes.error) {
    console.error('onboarding.queue_read_failed', {
      message:
        customersRes.error?.message ??
        connectionsRes.error?.message ??
        assignmentsRes.error?.message,
    });
    return [];
  }

  const state = new Map(
    ((connectionsRes.data ?? []) as { customer_id: string; state: HostConnectionState }[]).map(
      (row) => [row.customer_id, row.state],
    ),
  );
  const assigned = new Set(
    ((assignmentsRes.data ?? []) as { customer_id: string }[]).map((row) => row.customer_id),
  );

  const waiting: AwaitingHost[] = [];
  for (const row of (customersRes.data ?? []) as CustomerRow[]) {
    if (assigned.has(row.id)) continue;
    const current = state.get(row.id) ?? 'not_started';
    if (current !== 'not_started') continue;
    waiting.push({
      customerId: row.id,
      email: row.email,
      fullName: row.full_name,
      state: current,
      waitingSince: row.created_at,
    });
    if (waiting.length >= capped) break;
  }
  return waiting;
}

export type InviteDelivery =
  | { ok: true; state: HostConnectionState }
  | { ok: false; error: 'unknown_customer' | 'invalid_url' | 'already_connected' | 'write_failed' };

export async function deliverInvite(
  customerId: string,
  inviteUrl: string,
  source: string,
): Promise<InviteDelivery> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: 'unknown_customer' };

  if (!/^https:\/\/\S+$/.test(inviteUrl.trim())) return { ok: false, error: 'invalid_url' };

  const before = await getHostConnection(customerId);
  if (before && ['connected', 'no_listings'].includes(before.state)) {
    return { ok: false, error: 'already_connected' };
  }

  if (!(await recordInvite(customerId, inviteUrl))) return { ok: false, error: 'write_failed' };

  const after = await getHostConnection(customerId);
  await recordEvent({
    event: 'host_invite_delivered',
    customerId,
    distinctId: customerId,
    properties: { actor: source },
    source: 'server',
  });
  return { ok: true, state: after?.state ?? 'invite_sent' };
}
