import 'server-only';
import type { createSupabaseServiceRoleClient } from '../supabase/server';
import { sendWhatsAppViaWorker } from '../whatsapp/send';

type Supabase = ReturnType<typeof createSupabaseServiceRoleClient>;

export async function notifyGuestHandoff(supabase: Supabase, threadId: string): Promise<boolean> {
  const { data: claimed } = await supabase
    .from('guest_threads')
    .update({ handoff_notified_at: new Date().toISOString() })
    .eq('id', threadId)
    .is('handoff_notified_at', null)
    .select('id, property_id, guest_name, reservation_category');
  const thread = (claimed ?? [])[0] as Record<string, unknown> | undefined;
  if (!thread) return false;

  const { data: property } = await supabase
    .from('properties')
    .select('nickname')
    .eq('id', thread.property_id as string)
    .maybeSingle();

  const text = [
    `Una conversación necesita a una persona — ${(property?.nickname as string | undefined) ?? 'unidad'} · ${(thread.guest_name as string | null) ?? 'huésped sin nombre'}`,
    thread.reservation_category === 'inquiry' ? 'Es una consulta previa, sin reserva.' : '',
    'Responde en el panel Luxel, en Bandeja.',
  ]
    .filter(Boolean)
    .join('\n');

  const wamid = await sendWhatsAppViaWorker(text);
  if (!wamid) {
    await supabase.from('guest_threads').update({ handoff_notified_at: null }).eq('id', threadId);
    return false;
  }
  return true;
}
