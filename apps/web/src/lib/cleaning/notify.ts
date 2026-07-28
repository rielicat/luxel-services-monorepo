import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/send';
import { sendWhatsAppViaWorker } from '@/lib/whatsapp/send';

type Supabase = ReturnType<typeof createSupabaseServiceRoleClient>;

/** Tells whoever runs the turnover that a cleaning is on: the host's own staff
 *  by email (with a WhatsApp deep link), Luxel via the ops bridge (the crew
 *  panel already lists it). Best-effort — never throws. */
export async function notifyCleaningScheduled(
  supabase: Supabase,
  propertyId: string,
  cleaningDate: string,
): Promise<void> {
  try {
    const { data: prop } = await supabase
      .from('properties')
      .select(
        'nickname, address, comuna, cleaning_managed_by, cleaning_contact_name, cleaning_contact_email, cleaning_contact_whatsapp',
      )
      .eq('id', propertyId)
      .maybeSingle();
    if (!prop) return;
    const where = [prop.address, prop.comuna].filter(Boolean).join(', ');
    const summary = `Aseo confirmado — ${prop.nickname}${where ? ` (${where})` : ''} el ${cleaningDate}.`;
    if (prop.cleaning_managed_by === 'own' && prop.cleaning_contact_email) {
      const wa = prop.cleaning_contact_whatsapp?.replace(/\D/g, '');
      await sendEmail({
        to: prop.cleaning_contact_email,
        subject: `Aseo confirmado · ${prop.nickname} · ${cleaningDate}`,
        html: [
          `<p>Hola${prop.cleaning_contact_name ? ` ${prop.cleaning_contact_name}` : ''},</p>`,
          `<p>${summary}</p>`,
          `<p>Coordina el ingreso con el anfitrión si necesitas indicaciones.</p>`,
          wa ? `<p><a href="https://wa.me/${wa}">Responder por WhatsApp</a></p>` : '',
          `<p>— Luxel</p>`,
        ].join(''),
      });
    } else if (prop.cleaning_managed_by === 'luxel') {
      await sendWhatsAppViaWorker(`Nuevo aseo para el equipo: ${summary}`);
    }
  } catch {
    /* best-effort */
  }
}

/** The no-busywork path: when the property has auto-confirm on (the default),
 *  fresh check-out suggestions promote themselves to scheduled and notify —
 *  the host only ever intervenes to skip one. */
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
    .select('id, cleaning_date')
    .eq('property_id', propertyId)
    .eq('status', 'suggested')
    .gte('cleaning_date', today);
  if (!suggested?.length) return 0;

  for (const c of suggested) {
    await supabase.from('cleanings').update({ status: 'scheduled' }).eq('id', c.id);
    await notifyCleaningScheduled(supabase, propertyId, c.cleaning_date as string);
  }
  return suggested.length;
}
