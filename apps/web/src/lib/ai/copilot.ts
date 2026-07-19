import 'server-only';
import { getOpenAI, AI_MODEL } from './client';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { devMockEnabled } from '@/lib/dev-mock';

// Frustration / explicit-person triggers for the dev-mock and as a safety net.
const HANDOFF_RE = /(molest|enoj|terrible|p[ée]sim|hablar con|una persona|humano|reclamo|urgente)/i;

export type Draft = {
  ok: boolean;
  draft?: string;
  handoff?: boolean;
  reason?: 'no_ai' | 'not_found' | 'error';
};

const SYSTEM = `Eres el asistente del anfitrión de un alojamiento en Chile (AirBnB). Responde al huésped de forma breve, cálida y en español, usando SOLO la información del alojamiento que se te entrega. NO inventes datos: si la respuesta no está en la información, responde que consultarás con el anfitrión y añade la etiqueta [HANDOFF] al final. Añade también [HANDOFF] si detectas frustración, una queja seria, o si el huésped pide explícitamente hablar con una persona.`;

/**
 * Drafts a reply to a guest message grounded in the property's own info — the
 * no-PMS "co-pilot": the AI drafts, the host sends. Marks handoff when it can't
 * answer, detects frustration, or the guest asks for a person. Never throws.
 */
export async function draftGuestReply(
  propertyId: string,
  guestMessage: string,
  opts?: { history?: string },
): Promise<Draft> {
  const openai = getOpenAI();
  const useMock = !openai && devMockEnabled();
  if (!openai && !useMock) return { ok: true, handoff: true, reason: 'no_ai' };

  const supabase = createSupabaseServiceRoleClient();
  const { data: prop } = await supabase
    .from('properties')
    .select('nickname, address, comuna, guest_info')
    .eq('id', propertyId)
    .maybeSingle();
  if (!prop) return { ok: false, reason: 'not_found' };
  const { data: access } = await supabase
    .from('property_access')
    .select('method, keyless_instructions, concierge_hours')
    .eq('property_id', propertyId)
    .maybeSingle();

  const context = [
    `Propiedad: ${prop.nickname}${prop.comuna ? `, ${prop.comuna}` : ''}.`,
    prop.address ? `Dirección: ${prop.address}.` : '',
    access?.method === 'keyless'
      ? 'Acceso: cerradura con código (self check-in).'
      : access?.method === 'physical_concierge'
        ? `Acceso: llave en conserjería${access.concierge_hours ? ` (${access.concierge_hours})` : ''}.`
        : '',
    prop.guest_info ? `Información para huéspedes:\n${prop.guest_info}` : '',
    opts?.history ? `Contexto (respuestas previas + conversación):\n${opts.history}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (useMock) {
    const handoff = HANDOFF_RE.test(guestMessage);
    const draft = handoff
      ? ''
      : `¡Hola! Gracias por tu mensaje sobre ${prop.nickname}.${prop.guest_info ? ` Según la información del alojamiento: ${prop.guest_info.slice(0, 300)}.` : ''} Quedo atento/a a cualquier otra consulta.`;
    return { ok: true, draft, handoff };
  }
  if (!openai) return { ok: false, reason: 'error' }; // unreachable; narrows the type

  try {
    const res = await openai.chat.completions.create({
      model: AI_MODEL,
      temperature: 0.3,
      messages: [
        { role: 'system', content: `${SYSTEM}\n\n--- Información del alojamiento ---\n${context}` },
        { role: 'user', content: guestMessage },
      ],
    });
    const text = res.choices[0]?.message?.content?.trim() ?? '';
    const handoff = /\[HANDOFF\]/i.test(text);
    return { ok: true, draft: text.replace(/\[HANDOFF\]/gi, '').trim(), handoff };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
