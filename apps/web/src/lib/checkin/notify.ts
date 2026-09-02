import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { emailConfigured, sendEmail } from '@/lib/email/send';
import { sendWhatsAppTemplate, whatsappBridgeConfigured } from '@/lib/whatsapp/send';
import { stayRangeEs } from '@/lib/checkin/copy';
import { guestListLine, type GuestRow } from '@/lib/checkin/guest-list';
import { toE164Digits } from '@/lib/phone';

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

export async function notifyCheckin(checkinId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: checkin } = await supabase
    .from('checkins')
    .select(
      'id, property_id, guest_name, guest_email, guest_phone, party_size, arrival_at, arrival_date, departure_date, parking, vehicle_plate',
    )
    .eq('id', checkinId)
    .maybeSingle();
  if (!checkin) return;

  const [{ data: property }, { data: access }, { data: conserjes }, { data: guests }] =
    await Promise.all([
      supabase
        .from('properties')
        .select('id, nickname, address, comuna, owner_id')
        .eq('id', checkin.property_id)
        .maybeSingle(),
      supabase
        .from('property_access')
        .select('method, keyless_code, keyless_instructions, unit')
        .eq('property_id', checkin.property_id)
        .maybeSingle(),
      supabase
        .from('property_contacts')
        .select('name, email, whatsapp')
        .eq('property_id', checkin.property_id)
        .eq('role', 'concierge'),
      supabase
        .from('checkin_guests')
        .select('full_name, doc_type, doc_number_enc, doc_last4')
        .eq('checkin_id', checkinId)
        .order('is_lead', { ascending: false })
        .order('created_at', { ascending: true }),
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
  const guestRows = (guests ?? []) as GuestRow[];
  const guestList = guestListLine(guestRows) || (checkin.guest_name ?? 'Huésped');
  const stay =
    checkin.arrival_date && checkin.departure_date
      ? stayRangeEs(checkin.arrival_date as string, checkin.departure_date as string)
      : arrival;
  const unit = access?.unit ? `Depto. ${access.unit}` : property.nickname;
  const where = [property.address, property.comuna].filter(Boolean).join(', ') || '—';
  const parking =
    checkin.parking == null
      ? '—'
      : checkin.parking
        ? `sí${checkin.vehicle_plate ? ` · patente ${checkin.vehicle_plate}` : ''}`
        : 'no';
  const headcount = String(guestRows.length || checkin.party_size || 1);

  const reached = new Set<string>();
  if (whatsappBridgeConfigured()) {
    const params = [stay, unit, where, parking, headcount, guestList];
    for (const c of conserjes ?? []) {
      const to = toE164Digits(c.whatsapp as string | null);
      if (!to || reached.has(to)) continue;
      const ok = Boolean(await sendWhatsAppTemplate(to, 'concierge_arrival', params));
      if (ok) reached.add(to);
      results.push({ channel: 'whatsapp', to: `+${to}`, role: 'concierge', ok });
    }
  }

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

    for (const c of conserjes ?? []) {
      const to = toE164Digits(c.whatsapp as string | null);
      if ((to && reached.has(to)) || !c.email) continue;
      const html =
        `<p>Registro de huéspedes — <strong>${esc(unit)}</strong> (${esc(where)})</p>` +
        `<p>Estadía: ${esc(stay)}.</p>` +
        `<p>Estacionamiento: ${esc(parking)}.</p>` +
        `<p>Huéspedes (${headcount}):</p>` +
        `<ul>${guestRows.map((g) => `<li>${esc(guestListLine([g]))}</li>`).join('')}</ul>` +
        `<p>Llegada estimada: ${arrival}.</p>`;
      const r = await sendEmail({
        to: c.email as string,
        subject: `Registro de huéspedes — ${property.nickname}`,
        html,
      });
      results.push({ channel: 'email', to: c.email as string, role: 'concierge', ok: Boolean(r) });
    }

    if (owner?.email) {
      const html =
        `<p>Se recibió un check-in para <strong>${place}</strong>.</p>` +
        `<p>Huésped: ${who}${checkin.party_size ? ` · ${checkin.party_size} personas` : ''}</p>` +
        (checkin.guest_email ? `<p>Email: ${esc(checkin.guest_email)}</p>` : '') +
        (checkin.guest_phone ? `<p>Teléfono: ${esc(checkin.guest_phone)}</p>` : '') +
        `<p>Llegada: ${arrival}.</p>`;
      const r = await sendEmail({
        to: owner.email,
        subject: `Check-in recibido — ${property.nickname}`,
        html,
      });
      results.push({ channel: 'email', to: owner.email, role: 'host', ok: Boolean(r) });
    }
  }

  const anyChannel = emailConfigured() || whatsappBridgeConfigured();
  const status = !anyChannel ? 'submitted' : results.some((r) => r.ok) ? 'notified' : 'failed';
  await supabase
    .from('checkins')
    .update({ status, notified_at: new Date().toISOString(), notify_result: results })
    .eq('id', checkinId);
}
