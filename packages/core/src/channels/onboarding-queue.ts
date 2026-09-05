import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { recordEvent } from '../analytics/store';
import { emailConfigured, sendEmail } from '../email/send';
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

export async function requestConnection(customerId: string): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const current = await getHostConnection(customerId);
  if (current && current.state !== 'not_started') return true;
  const now = new Date().toISOString();
  const { error } = await supabase
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
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('host_connection')
    .select('requested_at')
    .eq('customer_id', customerId)
    .maybeSingle();
  return (data?.requested_at as string | null) ?? null;
}

export async function hostsAwaitingInvite(limit = INVITE_QUEUE_LIMIT): Promise<AwaitingHost[]> {
  const capped = Math.min(Math.max(limit, 1), INVITE_QUEUE_LIMIT);
  const supabase = createSupabaseServiceRoleClient();

  const [customersRes, connectionsRes, assignmentsRes] = await Promise.all([
    supabase
      .from('customers')
      .select('id, email, full_name, created_at')
      .order('created_at', { ascending: true })
      .limit(300),
    supabase.from('host_connection').select('customer_id, state, requested_at').limit(500),
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

  type ConnRow = { customer_id: string; state: HostConnectionState; requested_at: string | null };
  const conns = new Map(
    ((connectionsRes.data ?? []) as ConnRow[]).map((row) => [row.customer_id, row]),
  );
  const assigned = new Set(
    ((assignmentsRes.data ?? []) as { customer_id: string }[]).map((row) => row.customer_id),
  );

  const waiting: AwaitingHost[] = [];
  for (const row of (customersRes.data ?? []) as CustomerRow[]) {
    if (assigned.has(row.id)) continue;
    const conn = conns.get(row.id);
    if (!conn?.requested_at || conn.state !== 'not_started') continue;
    waiting.push({
      customerId: row.id,
      email: row.email,
      fullName: row.full_name,
      state: conn.state,
      waitingSince: conn.requested_at,
    });
  }
  waiting.sort((a, b) => a.waitingSince.localeCompare(b.waitingSince));
  return waiting.slice(0, capped);
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
  const emailed = await mailInvite(customerId, inviteUrl);
  await recordEvent({
    event: 'host_invite_delivered',
    customerId,
    distinctId: customerId,
    properties: { actor: source, emailed },
    source: 'server',
  });
  return { ok: true, state: after?.state ?? 'invite_sent' };
}

const INVITE_SUBJECT = 'Conecta tu Airbnb con Luxel';

function inviteHtml(url: string): string {
  return [
    '<p>Ya está lista tu invitación para conectar tu Airbnb.</p>',
    `<p><a href="${url}">Abrir la invitación</a></p>`,
    '<p>Abres el enlace, inicias sesión en Airbnb y eliges tus propiedades. Nada que instalar.</p>',
    '<p>Nunca te pedimos tu clave de Airbnb.</p>',
  ].join('');
}

async function mailInvite(customerId: string, inviteUrl: string): Promise<boolean> {
  if (!emailConfigured()) return false;
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('customers')
    .select('email')
    .eq('id', customerId)
    .maybeSingle();
  const to = (data?.email as string | null) ?? null;
  if (!to) return false;
  return Boolean(await sendEmail({ to, subject: INVITE_SUBJECT, html: inviteHtml(inviteUrl) }));
}
