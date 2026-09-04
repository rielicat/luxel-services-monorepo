import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { emailConfigured, sendEmail } from '../email/send';
import { sendWhatsAppTemplate, whatsappBridgeConfigured } from '../whatsapp/send';
import { longDateEs, stayRangeEs } from './copy';
import { guestListLine, type GuestRow } from './guest-list';
import { recipients } from '../crew';
import { toE164Digits } from '../phone';

type NotifyResult = Array<{ channel: string; to: string; role: string; ok: boolean }>;

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}

const TEMPLATE_HEAD = 'Registro de huéspedes en conserjería';
const TEMPLATE_FOOT = 'Gracias, equipo Luxel';

function registrationHtml(params: string[]): string {
  const [stay, place, parking, people] = params;
  return (
    `<p>${esc(TEMPLATE_HEAD)}</p>` +
    `<p>📅 Estadía: ${esc(stay ?? '—')}<br />` +
    `🏠 Departamento: ${esc(place ?? '—')}<br />` +
    `🚗 Estacionamiento: ${esc(parking ?? '—')}<br />` +
    `👥 Huéspedes: ${esc(people ?? '—')}</p>` +
    `<p>${esc(TEMPLATE_FOOT)}</p>`
  );
}

export async function notifyCheckin(checkinId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: checkin, error: checkinError } = await supabase
    .from('checkins')
    .select(
      'id, property_id, guest_name, party_size, arrival_time, arrival_date, departure_date, parking, vehicle_plate',
    )
    .eq('id', checkinId)
    .maybeSingle();
  if (checkinError) {
    console.warn('checkin.notify_query_failed', { checkinId, message: checkinError.message });
    return;
  }
  if (!checkin) return;

  const [{ data: property }, { data: access }, conserjes, { data: guests }] = await Promise.all([
    supabase
      .from('properties')
      .select('id, nickname, address, comuna, owner_id')
      .eq('id', checkin.property_id)
      .maybeSingle(),
    supabase
      .from('property_access')
      .select('unit')
      .eq('property_id', checkin.property_id)
      .maybeSingle(),
    recipients(checkin.property_id as string, 'concierge', supabase),
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
    .select('email, full_name, phone')
    .eq('id', property.owner_id)
    .maybeSingle();

  const results: NotifyResult = [];
  const arrival =
    checkin.arrival_date && checkin.arrival_time
      ? `${longDateEs(checkin.arrival_date as string)}, ${checkin.arrival_time}`
      : 'por confirmar';
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

  const place = where === '—' ? unit : `${unit} · ${where}`;
  const conserjeParams = [stay, place, parking, `${headcount} · ${guestList}`];
  const hostParams = [
    stay,
    place,
    parking,
    `${headcount} · reserva de ${checkin.guest_name ?? 'huésped'} · llegada ${arrival}`,
  ];

  const reached = new Set<string>();
  if (whatsappBridgeConfigured()) {
    const params = conserjeParams;
    for (const c of conserjes) {
      const to = c.phone;
      if (!to || reached.has(to)) continue;
      const ok = Boolean(await sendWhatsAppTemplate(to, 'concierge_arrival', params));
      reached.add(to);
      results.push({ channel: 'whatsapp', to: `+${to}`, role: 'concierge', ok });
    }

    const ownerPhone = toE164Digits(owner?.phone as string | null | undefined);
    if (ownerPhone && !reached.has(ownerPhone)) {
      const ok = Boolean(await sendWhatsAppTemplate(ownerPhone, 'concierge_arrival', hostParams));
      results.push({ channel: 'whatsapp', to: `+${ownerPhone}`, role: 'host', ok });
    }
  }

  if (emailConfigured()) {
    for (const c of conserjes) {
      if (!c.email) continue;
      const r = await sendEmail({
        to: c.email,
        subject: `${TEMPLATE_HEAD} — ${property.nickname}`,
        html: registrationHtml(conserjeParams),
      });
      results.push({ channel: 'email', to: c.email, role: 'concierge', ok: Boolean(r) });
    }

    if (owner?.email) {
      const r = await sendEmail({
        to: owner.email,
        subject: `${TEMPLATE_HEAD} — ${property.nickname}`,
        html: registrationHtml(hostParams),
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
