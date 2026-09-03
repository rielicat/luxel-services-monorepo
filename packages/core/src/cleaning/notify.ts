import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { sendEmail } from '../email/send';
import { sendWhatsAppTemplate, sendWhatsAppViaWorker } from '../whatsapp/send';
import { longDateEs } from '../checkin/copy';
import { shiftDate } from '../checkin/window';
import { recipients } from '../crew';
import { appUrl } from '../urls';

type Supabase = ReturnType<typeof createSupabaseServiceRoleClient>;

const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const NOTIFY_HORIZON_DAYS = 14;

const esc = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

const windowText = (checkout: string | null, checkin: string | null) =>
  checkout && checkin
    ? ` Ventana sugerida: ${checkout}–${checkin}.`
    : checkout
      ? ` Desde las ${checkout}.`
      : '';

function cleaningDateText(isoDate: string, checkout: string | null): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const weekday = WEEKDAYS_ES[new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)).getUTCDay()];
  return `${weekday} ${longDateEs(isoDate)}${checkout ? `, ${checkout}` : ''}`;
}

export async function notifyCleaningScheduled(
  supabase: Supabase,
  propertyId: string,
  cleaningId: string,
): Promise<void> {
  try {
    const [{ data: prop }, { data: cleaning }, crew, { data: access }] = await Promise.all([
      supabase
        .from('properties')
        .select('nickname, address, comuna, checkin_time, checkout_time')
        .eq('id', propertyId)
        .maybeSingle(),
      supabase
        .from('cleanings')
        .select('cleaning_date, confirm_token')
        .eq('id', cleaningId)
        .maybeSingle(),
      recipients(propertyId, 'cleaning', supabase),
      supabase.from('property_access').select('unit').eq('property_id', propertyId).maybeSingle(),
    ]);
    if (!prop || !cleaning) return;
    const where = [prop.address, prop.comuna].filter(Boolean).join(', ');
    const token = cleaning.confirm_token as string;
    const confirmUrl = `${appUrl()}/cleaning/confirm/${token}`;
    const win = windowText(prop.checkout_time as string | null, prop.checkin_time as string | null);
    const summary = `Aseo agendado — ${prop.nickname}${where ? ` (${where})` : ''} el ${cleaning.cleaning_date}.${win}`;
    const params = [
      cleaningDateText(cleaning.cleaning_date as string, prop.checkout_time as string | null),
      `${prop.nickname}${access?.unit ? ` · Depto. ${access.unit}` : ''}`,
    ];
    const buttons = [`clean:${token}:yes`, `clean:${token}:no`];
    for (const c of crew) {
      const wamid = c.phone
        ? await sendWhatsAppTemplate(c.phone, 'cleaning_confirm', params, buttons)
        : null;
      if (wamid || !c.email) continue;
      await sendEmail({
        to: c.email,
        subject: `Aseo · ${prop.nickname} · ${cleaning.cleaning_date} — confirma tu asistencia`,
        html: [
          `<p>Hola${c.name ? ` ${esc(c.name)}` : ''},</p>`,
          `<p>${esc(summary)}</p>`,
          `<p><a href="${confirmUrl}" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Confirmar asistencia</a></p>`,
          `<p>Si no puedes ir, responde este correo para coordinar con el equipo Luxel.</p>`,
          `<p>— Luxel</p>`,
        ].join(''),
      });
    }
    await sendWhatsAppViaWorker(
      `Nuevo aseo para el equipo: ${summary} Confirmar asistencia: ${confirmUrl}`,
    );
  } catch {}
}

export async function notifyCleaningCancelled(
  propertyId: string,
  cleaningDate: string,
): Promise<void> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data: prop } = await supabase
      .from('properties')
      .select('nickname')
      .eq('id', propertyId)
      .maybeSingle();
    if (!prop) return;
    await sendWhatsAppViaWorker(
      `Aseo cancelado — ${prop.nickname} el ${cleaningDate}. La reserva ya no está en el calendario; avisa al equipo.`,
    );
  } catch {}
}

export async function autoConfirmSuggested(propertyId: string, today: string): Promise<number> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: suggested } = await supabase
    .from('cleanings')
    .select('id')
    .eq('property_id', propertyId)
    .eq('status', 'suggested')
    .gte('cleaning_date', today)
    .lte('cleaning_date', shiftDate(today, NOTIFY_HORIZON_DAYS));
  if (!suggested?.length) return 0;

  for (const c of suggested) {
    await supabase.from('cleanings').update({ status: 'scheduled' }).eq('id', c.id);
    await notifyCleaningScheduled(supabase, propertyId, c.id as string);
  }
  return suggested.length;
}
