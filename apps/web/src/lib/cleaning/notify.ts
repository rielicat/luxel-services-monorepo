import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/send';
import { sendWhatsAppViaWorker } from '@/lib/whatsapp/send';
import { appUrl } from '@/lib/urls';

type Supabase = ReturnType<typeof createSupabaseServiceRoleClient>;

// Host-controlled strings land in email HTML — escape at the interpolation
// sites only (the same summary goes out verbatim as WhatsApp plain text).
const esc = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

/** Same-day turnover window derived from the listing's real times: the crew
 *  can start at check-out and must finish before the next check-in. */
const windowText = (checkout: string | null, checkin: string | null) =>
  checkout && checkin
    ? ` Ventana sugerida: ${checkout}–${checkin}.`
    : checkout
      ? ` Desde las ${checkout}.`
      : '';

/** Tells everyone who runs the turnover that a cleaning is on, with a
 *  tokenized link so THEY confirm attendance — the host only watches the
 *  status flip. Own staff (a host-managed contact list) get emails; Luxel
 *  turnovers ping the ops bridge. Best-effort — never throws. */
export async function notifyCleaningScheduled(
  supabase: Supabase,
  propertyId: string,
  cleaningId: string,
): Promise<void> {
  try {
    const [{ data: prop }, { data: cleaning }, { data: contacts }] = await Promise.all([
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
      supabase.from('cleaning_contacts').select('name, email').eq('property_id', propertyId),
    ]);
    if (!prop || !cleaning) return;
    const where = [prop.address, prop.comuna].filter(Boolean).join(', ');
    const confirmUrl = `${appUrl()}/cleaning/confirm/${cleaning.confirm_token}`;
    const win = windowText(prop.checkout_time as string | null, prop.checkin_time as string | null);
    const summary = `Aseo agendado — ${prop.nickname}${where ? ` (${where})` : ''} el ${cleaning.cleaning_date}.${win}`;
    if (prop.cleaning_managed_by === 'own') {
      for (const c of contacts ?? []) {
        if (!c.email) continue;
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
  } catch {
    /* best-effort */
  }
}

/** The no-busywork path: when the property has auto-confirm on (the default),
 *  fresh check-out suggestions promote themselves to scheduled and notify the
 *  crew — the host only ever intervenes to skip one. */
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
