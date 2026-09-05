import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { recordEvent } from '../analytics/store';
import { getHostConnection, recordInvite } from './connection';

export const INVITE_QUEUE_LIMIT = 25;

const CANDIDATE_PAGE = 200;

export interface AwaitingHost {
  customerId: string;
  email: string;
  fullName: string | null;
  waitingSince: string;
}

type CustomerRow = { id: string; email: string; full_name: string | null; created_at: string };

export async function hostsAwaitingInvite(limit: number): Promise<AwaitingHost[]> {
  const supabase = createSupabaseServiceRoleClient();
  const oldest = await supabase
    .from('customers')
    .select('id, email, full_name, created_at')
    .order('created_at', { ascending: true })
    .limit(CANDIDATE_PAGE);

  const rows = (oldest.data ?? []) as CustomerRow[];
  if (oldest.error || !rows.length) {
    if (oldest.error) console.error('onboarding.queue_read_failed', oldest.error.message);
    return [];
  }

  const ids = rows.map((row) => row.id);
  const [connections, assignments] = await Promise.all([
    supabase
      .from('host_connection')
      .select('customer_id')
      .in('customer_id', ids)
      .neq('state', 'not_started'),
    supabase.from('listing_assignments').select('customer_id').in('customer_id', ids),
  ]);

  const failure = connections.error ?? assignments.error;
  if (failure) {
    console.error('onboarding.queue_read_failed', failure.message);
    return [];
  }

  const served = new Set(
    [...(connections.data ?? []), ...(assignments.data ?? [])].map((row) =>
      String((row as { customer_id: string }).customer_id),
    ),
  );

  return rows
    .filter((row) => !served.has(row.id))
    .slice(0, limit)
    .map((row) => ({
      customerId: row.id,
      email: row.email,
      fullName: row.full_name,
      waitingSince: row.created_at,
    }));
}

export type InviteDelivery =
  | { ok: true; state: 'invite_sent' }
  | { ok: false; error: 'unknown_customer' | 'already_connected' | 'write_failed' };

export async function deliverInvite(
  customerId: string,
  inviteUrl: string,
  source: string,
): Promise<InviteDelivery> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase.from('customers').select('id').eq('id', customerId).maybeSingle();
  if (!data) return { ok: false, error: 'unknown_customer' };

  const current = await getHostConnection(customerId);
  if (current && ['connected', 'no_listings'].includes(current.state)) {
    return { ok: false, error: 'already_connected' };
  }

  if (!(await recordInvite(customerId, inviteUrl))) return { ok: false, error: 'write_failed' };

  await recordEvent({
    event: 'host_invite_delivered',
    customerId,
    distinctId: customerId,
    properties: { actor: source },
    source: 'server',
  });
  return { ok: true, state: 'invite_sent' };
}
