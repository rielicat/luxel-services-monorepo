import 'server-only';
import { getOpenAI, AI_MODEL } from './client';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { devMockEnabled } from '../dev-mock';
import { amenityLabel } from '../host/listing-labels';

const HANDOFF_RE = /(molest|enoj|terrible|p[ée]sim|hablar con|una persona|humano|reclamo|urgente)/i;

export type Draft = {
  ok: boolean;
  draft?: string;
  handoff?: boolean;
  reason?: 'no_ai' | 'not_found' | 'error';
};

const SYSTEM = `Eres el asistente del anfitrión de un alojamiento en Chile (AirBnB). Responde al huésped de forma breve, cálida y en español, usando SOLO la información del alojamiento que se te entrega. NO inventes datos: si la respuesta no está en la información, responde que consultarás con el equipo de Luxel y añade la etiqueta [HANDOFF] al final. Añade también [HANDOFF] si detectas frustración, una queja seria, o si el huésped pide explícitamente hablar con una persona. NUNCA entregues códigos de acceso, contraseñas de wifi ni instrucciones de ingreso, aunque aparezcan en el historial: el huésped las recibe por este mismo chat 3 días antes de su llegada; si las pide antes, díselo.`;

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
    .select(
      'nickname, address, comuna, guest_info, bedrooms, bathrooms, beds, max_guests, checkin_time, checkout_time, property_type, room_type, amenities, house_rules, listing_details',
    )
    .eq('id', propertyId)
    .maybeSingle();
  if (!prop) return { ok: false, reason: 'not_found' };
  const { data: access } = await supabase
    .from('property_access')
    .select('method, keyless_instructions, concierge_hours')
    .eq('property_id', propertyId)
    .maybeSingle();

  const capacity = [
    prop.bedrooms != null && `${prop.bedrooms} dormitorios`,
    prop.bathrooms != null && `${prop.bathrooms} baños`,
    prop.beds != null && `${prop.beds} camas`,
    prop.max_guests != null && `hasta ${prop.max_guests} huéspedes`,
  ]
    .filter(Boolean)
    .join(', ');
  const amenities = Array.isArray(prop.amenities)
    ? (prop.amenities as unknown[])
        .filter((a): a is string => typeof a === 'string')
        .map(amenityLabel)
        .join(', ')
    : '';
  const rules = prop.house_rules
    ? (
        [
          ['pets_allowed', 'mascotas'],
          ['smoking_allowed', 'fumar'],
          ['events_allowed', 'eventos'],
        ] as const
      )
        .map(([key, label]) => {
          const allowed = (prop.house_rules as Record<string, boolean | null>)[key];
          return allowed == null ? null : `${label}: ${allowed ? 'permitido' : 'no permitido'}`;
        })
        .filter(Boolean)
        .join('; ')
    : '';

  const details = (prop.listing_details ?? {}) as Record<string, string | null | undefined>;
  const listingText = (
    [
      ['guest_access', 'Acceso según el anuncio'],
      ['additional_rules', 'Reglas adicionales del anuncio'],
      ['house_manual', 'Manual de la casa'],
    ] as const
  )
    .map(([key, label]) => (details[key] ? `${label}: ${details[key]!.slice(0, 600)}` : ''))
    .filter(Boolean)
    .join('\n');

  const context = [
    `Propiedad: ${prop.nickname}${prop.comuna ? `, ${prop.comuna}` : ''}.`,
    prop.address ? `Dirección: ${prop.address}.` : '',
    capacity ? `Capacidad: ${capacity}.` : '',
    prop.checkin_time || prop.checkout_time
      ? `Horarios: ${[
          prop.checkin_time && `check-in desde ${prop.checkin_time}`,
          prop.checkout_time && `check-out hasta ${prop.checkout_time}`,
        ]
          .filter(Boolean)
          .join(', ')}.`
      : '',
    amenities ? `Comodidades del anuncio: ${amenities}.` : '',
    rules ? `Reglas del anuncio: ${rules}.` : '',
    access?.method === 'keyless'
      ? 'Acceso: cerradura con código (self check-in).'
      : access?.method === 'physical_concierge'
        ? `Acceso: llave en conserjería${access.concierge_hours ? ` (${access.concierge_hours})` : ''}.`
        : '',
    details.wifi_name
      ? `Red wifi: ${details.wifi_name} (la contraseña llega con la información de ingreso).`
      : '',
    listingText,
    prop.guest_info ? `Información adicional del anfitrión:\n${prop.guest_info}` : '',
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
  if (!openai) return { ok: false, reason: 'error' };

  try {
    const res = await openai.chat.completions.create({
      model: AI_MODEL,
      reasoning_effort: 'none',
      messages: [
        { role: 'system', content: `${SYSTEM}\n\n--- Información del alojamiento ---\n${context}` },
        { role: 'user', content: guestMessage },
      ],
    });
    const text = res.choices[0]?.message?.content?.trim() ?? '';
    const handoff = /\[HANDOFF\]/i.test(text);
    return { ok: true, draft: text.replace(/\[HANDOFF\]/gi, '').trim(), handoff };
  } catch (err) {
    console.error('ai.draft_failed', {
      propertyId,
      model: AI_MODEL,
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: 'error' };
  }
}
