import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { emailConfigured, sendEmail } from '@/lib/email/send';

type NotifyResult = Array<{ channel: string; to: string; role: string; ok: boolean }>;

function fmtArrival(iso: string | null): string {
  if (!iso) return 'por confirmar';
  try {
    return new Intl.DateTimeFormat('es-CL', {
      timeZone: 'America/Santiago',
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}

/**
 * Routes a submitted check-in to the person who lets the guest in: the access
 * code goes to the GUEST for a keyless lock, or the arrival details go to the
 * CONCIERGE for a physical key; either way a confirmation goes to the HOST.
 * WhatsApp delivery needs an approved Meta template, so this uses email today.
 * Never throws; records the per-channel outcome on the check-in.
 */
export async function notifyCheckin(checkinId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: checkin } = await supabase
    .from('checkins')
    .select('id, property_id, guest_name, guest_email, party_size, arrival_at')
    .eq('id', checkinId)
    .maybeSingle();
  if (!checkin) return;

  const [{ data: property }, { data: access }] = await Promise.all([
    supabase
      .from('properties')
      .select('id, nickname, address, owner_id')
      .eq('id', checkin.property_id)
      .maybeSingle(),
    supabase
      .from('property_access')
      .select('*')
      .eq('property_id', checkin.property_id)
      .maybeSingle(),
  ]);
  if (!property) return;
  const { data: owner } = await supabase
    .from('customers')
    .select('email, full_name')
    .eq('id', property.owner_id)
    .maybeSingle();

  const results: NotifyResult = [];
  const place = esc(property.nickname);
  const who = esc(checkin.guest_name ?? 'Huésped');
  const arrival = fmtArrival(checkin.arrival_at);

  if (emailConfigured()) {
    if (access?.method === 'keyless' && checkin.guest_email) {
      const html =
        `<p>Hola ${who}, ¡bienvenido/a a <strong>${place}</strong>!</p>` +
        `<p>Tu acceso es sin llave.</p>` +
        (access.keyless_code ? `<p>Código: <strong>${esc(access.keyless_code)}</strong></p>` : '') +
        (access.keyless_instructions ? `<p>${esc(access.keyless_instructions)}</p>` : '') +
        `<p>Llegada estimada: ${arrival}.</p>`;
      const r = await sendEmail({
        to: checkin.guest_email,
        subject: `Tu acceso — ${property.nickname}`,
        html,
      });
      results.push({ channel: 'email', to: checkin.guest_email, role: 'guest', ok: Boolean(r) });
    }

    if (access?.method === 'physical_concierge' && access.concierge_email) {
      const html =
        `<p>Llega un huésped a <strong>${place}</strong>.</p>` +
        `<p>Huésped: ${who}${checkin.party_size ? ` · ${checkin.party_size} personas` : ''}</p>` +
        `<p>Llegada: ${arrival}.</p>` +
        `<p>Por favor, entrégale la llave.</p>`;
      const r = await sendEmail({
        to: access.concierge_email,
        subject: `Llegada de huésped — ${property.nickname}`,
        html,
      });
      results.push({
        channel: 'email',
        to: access.concierge_email,
        role: 'concierge',
        ok: Boolean(r),
      });
    }

    if (owner?.email) {
      const html =
        `<p>Se recibió un check-in para <strong>${place}</strong>.</p>` +
        `<p>Huésped: ${who}${checkin.party_size ? ` · ${checkin.party_size} personas` : ''}</p>` +
        `<p>Llegada: ${arrival}.</p>`;
      const r = await sendEmail({
        to: owner.email,
        subject: `Check-in recibido — ${property.nickname}`,
        html,
      });
      results.push({ channel: 'email', to: owner.email, role: 'host', ok: Boolean(r) });
    }
  }

  const status = !emailConfigured()
    ? 'submitted'
    : results.some((r) => r.ok)
      ? 'notified'
      : 'failed';
  await supabase
    .from('checkins')
    .update({ status, notified_at: new Date().toISOString(), notify_result: results })
    .eq('id', checkinId);
}
