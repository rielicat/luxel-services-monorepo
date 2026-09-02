import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/send';
import { sendWhatsAppTemplate, sendWhatsAppViaWorker } from '@/lib/whatsapp/send';
import { longDateEs } from '@/lib/checkin/copy';
import { toE164Digits } from '@/lib/phone';
import { appUrl } from '@/lib/urls';

type Supabase = ReturnType<typeof createSupabaseServiceRoleClient>;

const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

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
    const [{ data: prop }, { data: cleaning }, { data: contacts }, { data: access }] =
      await Promise.all([
        supabase
          .from('properties')
          .select('nickname, address, comuna, cleaning_managed_by, checkin_time, checkout_time')
          .eq('id', propertyId)
          .maybeSingle(),
        supabase
          .from('cleanings')
          .select('cleaning_date, confirm_token')
          .eq('id', cleaningId)
          .maybeSingle(),
        supabase
          .from('property_contacts')
          .select('name, email, whatsapp')
          .eq('property_id', propertyId)
          .eq('role', 'cleaning'),
        supabase.from('property_access').select('unit').eq('property_id', propertyId).maybeSingle(),
      ]);
    if (!prop || !cleaning) return;
    const where = [prop.address, prop.comuna].filter(Boolean).join(', ');
    const confirmUrl = `${appUrl()}/cleaning/confirm/${cleaning.confirm_token}`;
    const win = windowText(prop.checkout_time as string | null, prop.checkin_time as string | null);
    const summary = `Aseo agendado — ${prop.nickname}${where ? ` (${where})` : ''} el ${cleaning.cleaning_date}.${win}`;
    if (prop.cleaning_managed_by === 'own') {
      const token = cleaning.confirm_token as string;
      const params = [
        cleaningDateText(cleaning.cleaning_date as string, prop.checkout_time as string | null),
        `${prop.nickname}${access?.unit ? ` · Depto. ${access.unit}` : ''}`,
      ];
      const buttons = [`clean:${token}:yes`, `clean:${token}:no`];
      const texted = new Set<string>();
      for (const c of contacts ?? []) {
        const phone = toE164Digits(c.whatsapp as string | null);
        if (phone && texted.has(phone)) continue;
        if (phone) texted.add(phone);
        const wamid = phone
          ? await sendWhatsAppTemplate(phone, 'cleaning_confirm', params, buttons)
          : null;
        if (wamid || !c.email) continue;
        await sendEmail({
          to: c.email as string,
          subject: `Aseo · ${prop.nickname} · ${cleaning.cleaning_date} — confirma tu asistencia`,
          html: [
            `<p>Hola${c.name ? ` ${esc(c.name)}` : ''},</p>`,
            `<p>${esc(summary)}</p>`,
            `<p><a href="${confirmUrl}" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Confirmar asistencia</a></p>`,
            `<p>Si no puedes ir, responde este correo para coordinar con el anfitrión.</p>`,
            `<p>— Luxel</p>`,
          ].join(''),
        });
      }
    } else if (prop.cleaning_managed_by === 'luxel') {
      await sendWhatsAppViaWorker(
        `Nuevo aseo para el equipo: ${summary} Confirmar asistencia: ${confirmUrl}`,
      );
    }
  } catch {}
}

export async function autoConfirmSuggested(propertyId: string, today: string): Promise<number> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: prop } = await supabase
    .from('properties')
    .select('cleaning_auto_confirm')
    .eq('id', propertyId)
    .maybeSingle();
  if (!prop?.cleaning_auto_confirm) return 0;

  const { data: suggested } = await supabase
    .from('cleanings')
    .select('id')
    .eq('property_id', propertyId)
    .eq('status', 'suggested')
    .gte('cleaning_date', today);
  if (!suggested?.length) return 0;

  for (const c of suggested) {
    await supabase.from('cleanings').update({ status: 'scheduled' }).eq('id', c.id);
    await notifyCleaningScheduled(supabase, propertyId, c.id as string);
  }
  return suggested.length;
}
