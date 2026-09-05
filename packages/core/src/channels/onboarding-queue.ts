import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { recordEvent } from '../analytics/store';
import { emailConfigured, sendEmail } from '../email/send';
import { getHostConnection, recordInvite } from './connection';

export const INVITE_QUEUE_LIMIT = 25;

const CANDIDATE_PAGE = 200;

export interface AwaitingHost {
  customerId: string;
  email: string;
  fullName: string | null;
  waitingSince: string;
}

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

export async function hostsAwaitingInvite(limit: number): Promise<AwaitingHost[]> {
  const supabase = createSupabaseServiceRoleClient();
  const requested = await supabase
    .from('host_connection')
    .select('customer_id, requested_at')
    .eq('state', 'not_started')
    .not('requested_at', 'is', null)
    .order('requested_at', { ascending: true })
    .limit(CANDIDATE_PAGE);

  const rows = (requested.data ?? []) as { customer_id: string; requested_at: string }[];
  if (requested.error || !rows.length) {
    if (requested.error) console.error('onboarding.queue_read_failed', requested.error.message);
    return [];
  }

  const ids = rows.map((row) => row.customer_id);
  const [customers, assignments] = await Promise.all([
    supabase.from('customers').select('id, email, full_name').in('id', ids),
    supabase.from('listing_assignments').select('customer_id').in('customer_id', ids),
  ]);

  const failure = customers.error ?? assignments.error;
  if (failure) {
    console.error('onboarding.queue_read_failed', failure.message);
    return [];
  }

  const assigned = new Set(
    ((assignments.data ?? []) as { customer_id: string }[]).map((row) => row.customer_id),
  );
  const byId = new Map(
    ((customers.data ?? []) as { id: string; email: string; full_name: string | null }[]).map(
      (row) => [row.id, row],
    ),
  );

  const waiting: AwaitingHost[] = [];
  for (const row of rows) {
    if (assigned.has(row.customer_id)) continue;
    const customer = byId.get(row.customer_id);
    if (!customer) continue;
    waiting.push({
      customerId: row.customer_id,
      email: customer.email,
      fullName: customer.full_name,
      waitingSince: row.requested_at,
    });
    if (waiting.length >= limit) break;
  }
  return waiting;
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

  const emailed = await mailInvite(customerId, inviteUrl);
  await recordEvent({
    event: 'host_invite_delivered',
    customerId,
    distinctId: customerId,
    properties: { actor: source, emailed },
    source: 'server',
  });
  return { ok: true, state: 'invite_sent' };
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
  const { data } = await createSupabaseServiceRoleClient()
    .from('customers')
    .select('email')
    .eq('id', customerId)
    .maybeSingle();
  const to = (data?.email as string | null) ?? null;
  if (!to) return false;
  return Boolean(await sendEmail({ to, subject: INVITE_SUBJECT, html: inviteHtml(inviteUrl) }));
}
