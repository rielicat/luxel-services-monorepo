'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { currentCustomerId, ownsProperty } from '@/lib/host/owner';
import { priceTurnover } from '@/lib/cleaning/price';
import { sendEmail } from '@/lib/email/send';
import { sendWhatsAppViaWorker } from '@/lib/whatsapp/send';

export async function getTurnoverPrice(
  propertyId: string,
): Promise<{ ok: boolean; priceClp?: number; error?: string }> {
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, propertyId))) return { ok: false };
  const r = await priceTurnover(propertyId);
  return 'priceClp' in r ? { ok: true, priceClp: r.priceClp } : { ok: true, error: r.error };
}

const StaffSchema = z.object({
  propertyId: z.string().uuid(),
  managedBy: z.enum(['luxel', 'own']),
  contactName: z.string().max(120).optional(),
  contactEmail: z.union([z.string().email().max(120), z.literal('')]).optional(),
  contactWhatsapp: z.string().max(30).optional(),
});

/** Who runs the turnovers: Luxel's crew, or the host's own staff (with the
 *  contact Luxel notifies automatically when a cleaning is confirmed). */
export async function updateCleaningStaff(input: unknown): Promise<{ ok: boolean }> {
  const p = StaffSchema.safeParse(input);
  if (!p.success) return { ok: false };
  const cid = await currentCustomerId();
  if (!cid || !(await ownsProperty(cid, p.data.propertyId))) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('properties')
    .update({
      cleaning_managed_by: p.data.managedBy,
      cleaning_contact_name: p.data.contactName?.trim() || null,
      cleaning_contact_email: p.data.contactEmail?.trim() || null,
      cleaning_contact_whatsapp: p.data.contactWhatsapp?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', p.data.propertyId);
  if (error) return { ok: false };
  revalidatePath('/properties');
  return { ok: true };
}

const StatusSchema = z.object({
  cleaningId: z.string().uuid(),
  status: z.enum(['scheduled', 'skipped', 'done']),
});

/** Confirming a cleaning notifies whoever runs it — automatically. The host's
 *  own staff get an email (with a WhatsApp deep link when we have their
 *  number); Luxel-managed turnovers ping the ops bridge and are already visible
 *  in the crew panel. Notification is best-effort and never blocks the status
 *  change. */
export async function setCleaningStatus(input: unknown): Promise<{ ok: boolean }> {
  const p = StatusSchema.safeParse(input);
  if (!p.success) return { ok: false };
  const cid = await currentCustomerId();
  if (!cid) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  const { data: cleaning } = await supabase
    .from('cleanings')
    .select('property_id, cleaning_date')
    .eq('id', p.data.cleaningId)
    .maybeSingle();
  if (!cleaning || !(await ownsProperty(cid, cleaning.property_id))) return { ok: false };
  await supabase.from('cleanings').update({ status: p.data.status }).eq('id', p.data.cleaningId);

  if (p.data.status === 'scheduled') {
    try {
      const { data: prop } = await supabase
        .from('properties')
        .select(
          'nickname, address, comuna, cleaning_managed_by, cleaning_contact_name, cleaning_contact_email, cleaning_contact_whatsapp',
        )
        .eq('id', cleaning.property_id)
        .maybeSingle();
      if (prop) {
        const where = [prop.address, prop.comuna].filter(Boolean).join(', ');
        const summary = `Aseo confirmado — ${prop.nickname}${where ? ` (${where})` : ''} el ${cleaning.cleaning_date}.`;
        if (prop.cleaning_managed_by === 'own' && prop.cleaning_contact_email) {
          const wa = prop.cleaning_contact_whatsapp?.replace(/\D/g, '');
          await sendEmail({
            to: prop.cleaning_contact_email,
            subject: `Aseo confirmado · ${prop.nickname} · ${cleaning.cleaning_date}`,
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
      }
    } catch {
      /* best-effort — the confirmation itself already persisted */
    }
  }

  revalidatePath('/properties');
  return { ok: true };
}
