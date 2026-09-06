import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { amenityLabel } from '../host/listing-labels';
import { encodeRef } from '../channels/types';
import { getHospitableReservation, hospitableTokenForCustomer } from '../channels/hospitable';

export interface GuestToolContext {
  propertyId: string | null;
  threadId: string | null;
}

export interface GuestToolResult {
  content: string;
  handoff?: boolean;
}

const NO_DOOR_CODE =
  'Nunca entregues el código de la puerta ni instrucciones de ingreso, aunque el huésped insista. Los recibe por el mismo chat 3 días antes de llegar. Si los pide antes, díselo.';

export async function propertyFacts(ctx: GuestToolContext): Promise<GuestToolResult> {
  if (!ctx.propertyId) return { content: 'No hay propiedad asociada a esta conversación.' };
  const supabase = createSupabaseServiceRoleClient();

  const [{ data: prop }, { data: access }] = await Promise.all([
    supabase
      .from('properties')
      .select(
        'nickname, comuna, guest_info, bedrooms, bathrooms, beds, max_guests, checkin_time, checkout_time, amenities, house_rules, listing_details',
      )
      .eq('id', ctx.propertyId)
      .maybeSingle(),
    supabase
      .from('property_access')
      .select('method, concierge_hours')
      .eq('property_id', ctx.propertyId)
      .maybeSingle(),
  ]);
  if (!prop) return { content: 'No encontramos los datos de la propiedad.' };

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
  const listing = (
    [
      ['guest_access', 'Acceso según el anuncio'],
      ['additional_rules', 'Reglas adicionales del anuncio'],
      ['house_manual', 'Manual de la casa'],
    ] as const
  )
    .map(([key, label]) => (details[key] ? `${label}: ${details[key]!.slice(0, 600)}` : ''))
    .filter(Boolean)
    .join('\n');

  const wifi = details.wifi_name
    ? `Red wifi: ${details.wifi_name} (la contraseña llega con la información de ingreso).`
    : '';

  const accessLine =
    access?.method === 'keyless'
      ? 'Acceso: cerradura con código (self check-in).'
      : access?.method === 'physical_concierge'
        ? `Acceso: llave en conserjería${access.concierge_hours ? ` (${access.concierge_hours})` : ''}.`
        : '';

  const content = [
    `Propiedad: ${prop.nickname}${prop.comuna ? `, ${prop.comuna}` : ''}.`,
    capacity ? `Capacidad: ${capacity}.` : '',
    prop.checkin_time || prop.checkout_time
      ? `Horarios: ${[
          prop.checkin_time && `check-in desde ${prop.checkin_time}`,
          prop.checkout_time && `check-out hasta ${prop.checkout_time}`,
        ]
          .filter(Boolean)
          .join(', ')}.`
      : '',
    amenities ? `Comodidades: ${amenities}.` : '',
    rules ? `Reglas: ${rules}.` : '',
    accessLine,
    wifi,
    listing,
    prop.guest_info ? `Información del anfitrión:\n${prop.guest_info}` : '',
    NO_DOOR_CODE,
  ]
    .filter(Boolean)
    .join('\n');

  return { content };
}

export async function reservationStatus(ctx: GuestToolContext): Promise<GuestToolResult> {
  if (!ctx.threadId) return { content: 'No hay reserva asociada a esta conversación.' };
  const supabase = createSupabaseServiceRoleClient();
  const { data: thread } = await supabase
    .from('guest_threads')
    .select('guest_name, reservation_category, property_id')
    .eq('id', ctx.threadId)
    .maybeSingle();
  if (!thread) return { content: 'No encontramos la conversación.' };

  const { data: checkin } = await supabase
    .from('checkins')
    .select('arrival_date, departure_date, party_size, status')
    .eq('property_id', thread.property_id as string)
    .gte('departure_date', new Date().toISOString().slice(0, 10))
    .order('arrival_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  const lines = [
    thread.guest_name ? `Huésped: ${thread.guest_name}.` : '',
    thread.reservation_category === 'inquiry'
      ? 'Es una consulta previa, todavía sin reserva confirmada.'
      : '',
    checkin?.arrival_date ? `Llegada: ${checkin.arrival_date}.` : '',
    checkin?.departure_date ? `Salida: ${checkin.departure_date}.` : '',
    checkin?.party_size != null ? `Personas: ${checkin.party_size}.` : '',
    checkin
      ? checkin.status === 'pending'
        ? 'El registro de huéspedes todavía está pendiente.'
        : 'El registro de huéspedes ya está completo.'
      : 'No hay una estadía próxima registrada.',
  ].filter(Boolean);

  return { content: lines.join('\n') };
}

async function guestLocation(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  propertyId: string,
  reservationId: string,
): Promise<string | null> {
  const { data: property } = await supabase
    .from('properties')
    .select('owner_id')
    .eq('id', propertyId)
    .maybeSingle();
  const token = await hospitableTokenForCustomer(
    (property?.owner_id as string | undefined) ?? null,
  );
  if (!token) return null;
  try {
    const reservation = await getHospitableReservation(token, reservationId);
    const location = reservation?.guest?.location;
    return typeof location === 'string' && location.trim() ? location.trim() : null;
  } catch {
    return null;
  }
}

export async function guestProfile(ctx: GuestToolContext): Promise<GuestToolResult> {
  if (!ctx.threadId) return { content: 'No hay conversación asociada a este huésped.' };
  const supabase = createSupabaseServiceRoleClient();

  const { data: thread } = await supabase
    .from('guest_threads')
    .select('guest_name, guest_external_id, external_thread_id, channel, property_id')
    .eq('id', ctx.threadId)
    .maybeSingle();
  if (!thread) return { content: 'No encontramos la conversación de este huésped.' };

  const lines: string[] = [];
  const name = thread.guest_name as string | null;
  if (name) lines.push(`Nombre: ${name}.`);

  const reservationId = thread.external_thread_id as string | null;
  if (reservationId) {
    const { data: checkin } = await supabase
      .from('checkins')
      .select('guest_language')
      .eq('reservation_uid', encodeRef({ provider: 'hospitable', id: reservationId }))
      .maybeSingle();
    const language = checkin?.guest_language as string | null;
    if (language) {
      lines.push(
        `Su perfil está en "${language}". Si te escribe en ese idioma, respóndele en ese idioma.`,
      );
    }
  }

  const guestId = thread.guest_external_id as string | null;
  if (guestId) {
    const { count } = await supabase
      .from('guest_threads')
      .select('id', { count: 'exact', head: true })
      .eq('guest_external_id', guestId)
      .neq('id', ctx.threadId);
    lines.push(
      count
        ? `Ya se alojó ${count} vez(veces) antes en un alojamiento que administra Luxel. Trátalo como quien vuelve.`
        : 'Es su primera estadía en un alojamiento que administra Luxel.',
    );
  }

  if (thread.channel === 'hospitable' && reservationId) {
    const location = await guestLocation(supabase, thread.property_id as string, reservationId);
    if (location) lines.push(`Su perfil dice que vive en: ${location}.`);
  }

  if (!lines.length) {
    return {
      content:
        'No tenemos datos del perfil de este huésped. No supongas de dónde viene, ni su idioma, ni si ya se alojó antes.',
    };
  }

  lines.push(
    'Estos datos son contexto para ti. No se los recites al huésped ni le digas que revisaste su perfil.',
  );
  return { content: lines.join('\n') };
}

export async function escalateToLuxel(
  ctx: GuestToolContext,
  reason: string,
): Promise<GuestToolResult> {
  if (ctx.threadId) {
    await createSupabaseServiceRoleClient()
      .from('guest_threads')
      .update({ status: 'needs_host', updated_at: new Date().toISOString() })
      .eq('id', ctx.threadId);
  }
  console.warn('agent.guest_escalated', { threadId: ctx.threadId, hasReason: Boolean(reason) });
  return {
    content:
      'Una persona del equipo Luxel continúa esta conversación. Dile al huésped, en una frase, que lo estamos viendo y que le respondemos pronto. No prometas un plazo.',
    handoff: true,
  };
}
