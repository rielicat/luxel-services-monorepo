import 'server-only';
import type OpenAI from 'openai';
import { workingHoursStatus } from '@/lib/working-hours';
import { PLAN_COMMISSION_PCT, planMonthlyCost } from '@/lib/plan-pricing';
import { fetchProperties } from '@/lib/host/queries';
import { hospitableAmountToClp, listHospitableCalendar } from '@/lib/channels/hospitable';
import { hospitableAccess } from '@/lib/channels/scope';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { createLead } from '@/lib/leads';
import { comparableMarketReference, MIN_COMPARABLE_LISTINGS } from './pricing-reference';

export const clp = (n: number) => '$' + n.toLocaleString('es-CL');

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const PLAN_LABEL = 'Plan Luxel';

export const PLAN_PRICE_LINE = `${pct(PLAN_COMMISSION_PCT)} de los ingresos por reservas, sin costo fijo`;

type Widget =
  | {
      kind: 'airbnb_quote';
      listings: number;
      planLabel: string;
      commissionPct: number;
      revenueClp: number;
      revenueMaxClp: number | null;
      keptClp: number;
      keptMaxClp: number | null;
      monthlyClp: number;
      monthlyMaxClp: number | null;
    }
  | {
      kind: 'links';
      actions: { label: string; href: string; style: 'primary' | 'outline' }[];
    }
  | {
      kind: 'handoff';
      whatsappUrl: string | null;
      withinHours: boolean;
      openHour: number;
      closeHour: number;
    };

const LINK_DESTINATIONS: Record<
  string,
  { label: string; href: string; style: 'primary' | 'outline' }
> = {
  airbnb_service: { label: 'Administración Airbnb', href: '/services/airbnb', style: 'primary' },
  pricing: { label: 'Ver el precio', href: '/calculator', style: 'primary' },
  account: { label: 'Mi cuenta', href: '/account', style: 'outline' },
  properties: { label: 'Mis propiedades', href: '/properties', style: 'primary' },
  sign_in: { label: 'Iniciar sesión', href: '/sign-in', style: 'primary' },
  about: { label: 'Sobre Luxel', href: '/about', style: 'outline' },
};

interface ToolResult {
  content: string;
  widget?: Widget;
  handoff?: boolean;
}

export interface ToolContext {
  whatsappNumber?: string | null;
  customerId?: string | null;
  signedIn?: boolean;
  sessionId?: string | null;
}

const NO_INVENTED_PRICING =
  'Nunca inventes ni estimes un precio por noche, una ocupación, unos ingresos ni una tarifa de limpieza, y nunca le pidas al visitante que investigue Airbnb o la competencia: fijar el precio por noche es el servicio que vende Luxel.';

const PRICING_PROPOSAL_STEP =
  'Explícale que Luxel fija y ajusta el precio por noche todos los días con PriceLabs, incluido en el plan, y ofrécele que Luxel prepare una propuesta de precios para su propiedad. Para eso pídele dirección o comuna, tamaño y dormitorios, y guárdalos con save_property_details.';

export function buildTools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'get_airbnb_quote',
        description: `Calcula cuánto le queda al anfitrión y cuánto cobra Luxel: ${pct(PLAN_COMMISSION_PCT)} de los ingresos por reservas, IVA incluido, por propiedad al mes. Úsala cuando el usuario quiere saber cuánto cuesta que Luxel administre sus propiedades. NUNCA inventes el monto: depende de los ingresos que el usuario declare. Si el usuario da un rango ("entre 900.000 y 1.100.000"), pasa los dos extremos en la misma llamada; NO la llames dos veces para dos escenarios.`,
        parameters: {
          type: 'object',
          properties: {
            listings: {
              type: 'integer',
              description: 'Cantidad de propiedades/listings de Airbnb a administrar (1–50).',
            },
            monthly_revenue_clp: {
              type: 'integer',
              description:
                'Ingresos mensuales por reservas de UNA propiedad, en pesos chilenos, sin la tarifa de limpieza. Si el usuario da un rango, este es el extremo bajo. Sin este dato no hay monto que mostrar.',
            },
            monthly_revenue_max_clp: {
              type: 'integer',
              description:
                'Extremo alto del rango de ingresos mensuales por reservas de UNA propiedad, si el usuario dio un rango. Omítelo cuando dio una sola cifra.',
            },
          },
          required: ['listings'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_pricing_reference',
        description: `Referencia de mercado a partir de datos REALES de las propiedades que Luxel administra: tarifa promedio por noche, ocupación e ingresos por reservas. Úsala siempre que pregunten cuánto puede ganar una propiedad, cuánto cobrar por noche, qué ocupación esperar o cuánto se cobra por el aseo. La herramienta responde con cifras solo si hay una muestra suficiente; si no la hay, te dirá qué responder. ${NO_INVENTED_PRICING}`,
        parameters: {
          type: 'object',
          properties: {
            comuna: {
              type: 'string',
              description: 'Comuna de la propiedad, por ejemplo "Providencia" o "Las Condes".',
            },
            bedrooms: {
              type: 'integer',
              description: 'Cantidad de dormitorios de la propiedad (0 para estudio).',
            },
          },
          required: [],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'save_property_details',
        description:
          'Guarda los datos de la propiedad que el visitante entrega (dirección, comuna, tamaño, dormitorios, ingresos) para que el equipo Luxel prepare la propuesta de precios y lo contacte. Llámala apenas tengas datos reales de la propiedad. Llámala una sola vez por dato nuevo, no repitas la misma información.',
        parameters: {
          type: 'object',
          properties: {
            address: { type: 'string', description: 'Dirección tal como la dio el visitante.' },
            comuna: { type: 'string', description: 'Comuna de la propiedad.' },
            bedrooms: { type: 'integer', description: 'Dormitorios (0 para estudio).' },
            size_m2: { type: 'integer', description: 'Superficie en metros cuadrados.' },
            monthly_revenue_clp: {
              type: 'integer',
              description: 'Ingresos mensuales por reservas que declaró el visitante, si los dio.',
            },
            notes: {
              type: 'string',
              description:
                'Otros datos útiles en una frase: equipamiento, amenities, si ya está publicada en Airbnb.',
            },
          },
          required: [],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_host_status',
        description:
          'Estado REAL de las propiedades del anfitrión con sesión iniciada: propiedades conectadas, próximas estadías, ocupación e ingresos estimados según su calendario de Airbnb. Úsala cuando un anfitrión pregunta por SUS propiedades, reservas, ocupación o ingresos. Nunca inventes estos datos.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    {
      type: 'function',
      function: {
        name: 'share_links',
        description:
          'Muestra 1–3 accesos directos útiles al usuario (páginas del sitio) según lo que necesita. Úsala para ofrecer el siguiente paso: ver el servicio, comparar planes, ir a sus propiedades o a su cuenta. Elige solo los destinos relevantes.',
        parameters: {
          type: 'object',
          properties: {
            destinations: {
              type: 'array',
              description: 'Destinos a mostrar, en orden de relevancia (máximo 3).',
              items: { type: 'string', enum: Object.keys(LINK_DESTINATIONS) },
              minItems: 1,
              maxItems: 3,
            },
          },
          required: ['destinations'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'escalate_to_human',
        description:
          'Deriva la conversación a una persona de Servicios Luxel por WhatsApp. Úsala cuando el usuario lo pide, cuando el caso excede lo que puedes resolver, o ante un reclamo.',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Motivo breve de la derivación.' },
          },
          required: [],
          additionalProperties: false,
        },
      },
    },
  ];
}

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  switch (name) {
    case 'get_airbnb_quote':
      return getAirbnbQuote(input);
    case 'get_pricing_reference':
      return getPricingReference(input);
    case 'save_property_details':
      return savePropertyDetails(input, ctx);
    case 'get_host_status':
      return getHostStatus(ctx);
    case 'share_links':
      return shareLinks(input);
    case 'escalate_to_human':
      return escalate(input, ctx);
    default:
      return { content: `Herramienta desconocida: ${name}` };
  }
}

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function getAirbnbQuote(input: Record<string, unknown>): ToolResult {
  const listings = Math.max(1, Math.min(50, Math.round(Number(input.listings ?? 1)) || 1));
  const low = positiveInt(input.monthly_revenue_clp);
  const priceLine = `${PLAN_LABEL}: ${PLAN_PRICE_LINE}, por propiedad al mes, IVA incluido. Todo incluido.`;
  if (low == null) {
    return {
      content: `${priceLine} Todavía no hay monto: el cobro se calcula sobre los ingresos reales por reservas. Si el visitante sabe cuánto genera al mes, pídeselo UNA sola vez y acepta un rango (mínimo y máximo). Si no lo sabe, no repitas la pregunta: usa get_pricing_reference y ofrécele la propuesta de precios de Luxel. ${NO_INVENTED_PRICING}`,
    };
  }
  const rawHigh = positiveInt(input.monthly_revenue_max_clp);
  const high = rawHigh != null && rawHigh > low ? rawHigh : null;

  const feeOf = (revenue: number) => planMonthlyCost(revenue) * listings;
  const keptOf = (revenue: number) => (revenue - planMonthlyCost(revenue)) * listings;

  const feeClp = feeOf(low);
  const keptClp = keptOf(low);
  const feeMaxClp = high == null ? null : feeOf(high);
  const keptMaxClp = high == null ? null : keptOf(high);

  const perListing = listings === 1 ? 'la propiedad' : `cada una de las ${listings} propiedades`;
  const forAll = listings === 1 ? '' : ` por las ${listings} propiedades`;
  const revenueText = high == null ? clp(low) : `entre ${clp(low)} y ${clp(high)}`;
  const keptText = keptMaxClp == null ? clp(keptClp) : `entre ${clp(keptClp)} y ${clp(keptMaxClp)}`;
  const feeText = feeMaxClp == null ? clp(feeClp) : `entre ${clp(feeClp)} y ${clp(feeMaxClp)}`;

  const content = [
    `Con ingresos de ${revenueText} al mes en ${perListing}, al anfitrión le quedan ${keptText} al mes${forAll}.`,
    `La comisión Luxel es ${feeText} al mes${forAll}. ${priceLine}`,
    'Parte SIEMPRE por lo que le queda al anfitrión; la comisión va después y en segundo plano.',
    'La tarifa de limpieza que paga el huésped no entra en esta base: va completa al equipo de aseo y no paga comisión.',
    'Airbnb le paga los ingresos directo al anfitrión y Luxel factura a fin de mes con el detalle.',
    'Ya se muestra UNA tarjeta con el resultado: no vuelvas a llamar esta herramienta en la misma respuesta para un segundo escenario.',
  ].join(' ');

  return {
    content,
    widget: {
      kind: 'airbnb_quote',
      listings,
      planLabel: PLAN_LABEL,
      commissionPct: PLAN_COMMISSION_PCT,
      revenueClp: low,
      revenueMaxClp: high,
      keptClp,
      keptMaxClp,
      monthlyClp: feeClp,
      monthlyMaxClp: feeMaxClp,
    },
  };
}

async function getPricingReference(input: Record<string, unknown>): Promise<ToolResult> {
  const rawBedrooms = Number(input.bedrooms);
  const reference = await comparableMarketReference({
    comuna: typeof input.comuna === 'string' ? input.comuna : null,
    bedrooms: Number.isFinite(rawBedrooms) ? Math.round(rawBedrooms) : null,
  });

  if (!reference.ok) {
    return {
      content: `Sin datos comparables suficientes (Luxel exige al menos ${MIN_COMPARABLE_LISTINGS} propiedades administradas para publicar un promedio, y así protege los ingresos de cada anfitrión). NO entregues ningún número: ni precio por noche, ni ocupación, ni ingresos, ni tarifa de limpieza, ni un rango, ni "referencias del mercado". No comentes cuántas propiedades administra Luxel ni menciones esta restricción interna. ${NO_INVENTED_PRICING} ${PRICING_PROPOSAL_STEP}`,
    };
  }

  return {
    content: `Datos reales de ${reference.listings} propiedades comparables que administra Luxel (últimos ${reference.windowDays} días): tarifa promedio por noche ${clp(reference.adrClp)}, ocupación ${reference.occupancyPct}%, ingresos por reservas ${clp(reference.monthlyRevenueClp)} al mes por propiedad. Son promedios ya realizados, no una promesa de resultados: preséntalos como referencia. No entregues datos de una propiedad ni de un anfitrión en particular. El precio final por noche lo fija Luxel todos los días con PriceLabs, incluido en el plan.`,
  };
}

interface PropertyDetails {
  address: string | null;
  comuna: string | null;
  bedrooms: number | null;
  sizeM2: number | null;
  monthlyRevenueClp: number | null;
  notes: string | null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function wholeNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function readPropertyDetails(input: Record<string, unknown>): PropertyDetails {
  return {
    address: text(input.address, 200),
    comuna: text(input.comuna, 80),
    bedrooms: wholeNumber(input.bedrooms),
    sizeM2: wholeNumber(input.size_m2),
    monthlyRevenueClp: positiveInt(input.monthly_revenue_clp),
    notes: text(input.notes, 500),
  };
}

interface LeadRow {
  id: string;
  commune: string | null;
  metadata: Record<string, unknown> | null;
}

async function storeLeadDetails(details: PropertyDetails, ctx: ToolContext): Promise<boolean> {
  const property: Record<string, unknown> = {};
  if (details.address) property.address = details.address;
  if (details.comuna) property.comuna = details.comuna;
  if (details.bedrooms != null) property.bedrooms = details.bedrooms;
  if (details.sizeM2 != null) property.size_m2 = details.sizeM2;
  if (details.monthlyRevenueClp != null) property.monthly_revenue_clp = details.monthlyRevenueClp;
  if (details.notes) property.notes = details.notes;

  const sessionId = ctx.sessionId ?? null;
  try {
    if (sessionId) {
      const supabase = createSupabaseServiceRoleClient();
      const { data } = await supabase
        .from('leads')
        .select('id, commune, metadata')
        .eq('session_id', sessionId)
        .eq('source', 'contact')
        .order('created_at', { ascending: false })
        .limit(1);
      const existing = (data ?? [])[0] as unknown as LeadRow | undefined;
      if (existing) {
        const metadata = existing.metadata ?? {};
        const previous = (metadata.property ?? {}) as Record<string, unknown>;
        const { error } = await supabase
          .from('leads')
          .update({
            commune: details.comuna ?? existing.commune,
            metadata: {
              ...metadata,
              via: 'lux_concierge',
              property: { ...previous, ...property },
            },
          })
          .eq('id', existing.id);
        return !error;
      }
    }
    const created = await createLead({
      source: 'contact',
      commune: details.comuna,
      message: details.notes,
      sessionId,
      customerId: ctx.customerId ?? null,
      metadata: { via: 'lux_concierge', property },
    });
    return created.ok;
  } catch {
    return false;
  }
}

async function savePropertyDetails(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const details = readPropertyDetails(input);
  const usable =
    Boolean(details.address) ||
    Boolean(details.comuna) ||
    details.bedrooms != null ||
    details.sizeM2 != null;
  if (!usable) {
    return {
      content: `Todavía no hay datos que guardar. Pídele dirección o comuna, tamaño y dormitorios, en una sola pregunta. ${NO_INVENTED_PRICING}`,
    };
  }
  const saved = await storeLeadDetails(details, ctx);
  const next = `Confírmale que el equipo Luxel prepara una propuesta de precios para su propiedad (precio por noche y proyección de ingresos) y lo contacta. ${NO_INVENTED_PRICING}`;
  return {
    content: saved
      ? `Guardamos los datos de la propiedad para el equipo Luxel. ${next}`
      : `No pudimos guardar los datos, pero no se lo menciones ni lo vuelvas a preguntar. ${next}`,
  };
}

const DAY = 86_400_000;

async function getHostStatus(ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.customerId) {
    if (ctx.signedIn) {
      return {
        content:
          'Su cuenta está recién creada y su perfil aún se está preparando. Pídele que abra Mis propiedades (el botón ya se muestra) o reintente en unos minutos.',
        widget: { kind: 'links', actions: [LINK_DESTINATIONS.properties!] },
      };
    }
    return {
      content:
        'El usuario no ha iniciado sesión, así que no puedes ver sus propiedades. Invítalo a ingresar con el botón que ya se muestra.',
      widget: { kind: 'links', actions: [LINK_DESTINATIONS.sign_in!] },
    };
  }
  const properties = await fetchProperties(ctx.customerId);
  if (!properties.length) {
    return {
      content:
        'La cuenta aún no tiene propiedades conectadas. Guíalo a conectar su Airbnb en Mis propiedades — el botón ya se muestra.',
      widget: { kind: 'links', actions: [LINK_DESTINATIONS.properties!] },
    };
  }

  const token = (await hospitableAccess(ctx.customerId))?.token ?? null;
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const from = iso(today);

  const lines: string[] = [];
  for (const p of properties.slice(0, 5)) {
    let occupancy = 'ocupación no disponible';
    let revenue = 'ingresos 30 días no disponibles';
    if (token && p.external_listing_id) {
      const days = await listHospitableCalendar(
        token,
        p.external_listing_id as string,
        from,
        iso(new Date(today.getTime() + 30 * DAY)),
      );
      if (days?.length) {
        const reserved = days.filter((d) => d.status?.reason === 'RESERVED');
        occupancy = `ocupación 30 días ${Math.round((reserved.length / days.length) * 100)}%`;
        const priced = reserved
          .map((d) => hospitableAmountToClp(d.price, d.price?.currency))
          .filter((a): a is number => a != null);
        if (priced.length) {
          const total = priced.reduce((sum, a) => sum + a, 0);
          revenue = `ingresos estimados 30 días ${clp(total)}`;
        }
      }
    }
    const upcoming = (p.calendar_blocks as { source: string; ends_on: string }[]).filter(
      (b) => b.source === 'import' && b.ends_on >= from,
    ).length;
    const stays = upcoming === 1 ? '1 estadía próxima' : `${upcoming} estadías próximas`;
    lines.push(`• ${p.nickname}: ${occupancy} · ${stays} · ${revenue}`);
  }

  return {
    content: `Estado real de sus propiedades (${properties.length} conectadas):\n${lines.join('\n')}\nResúmelo con claridad. Luxel atiende a los huéspedes y coordina el aseo; no menciones tareas pendientes para el anfitrión. El botón a Mis propiedades ya se muestra — menciónalo, no describas rutas.`,
    widget: { kind: 'links', actions: [LINK_DESTINATIONS.properties!] },
  };
}

function shareLinks(input: Record<string, unknown>): ToolResult {
  const raw = Array.isArray(input.destinations) ? input.destinations : [];
  const actions = raw
    .map((k) => LINK_DESTINATIONS[String(k)])
    .filter((d): d is (typeof LINK_DESTINATIONS)[string] => Boolean(d))
    .slice(0, 3);
  if (!actions.length) {
    return {
      content: 'No hay accesos directos que mostrar. Continúa la conversación normalmente.',
    };
  }
  return {
    content: 'Se mostraron accesos directos al usuario. Menciónalos brevemente en tu respuesta.',
    widget: { kind: 'links', actions },
  };
}

async function escalate(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const reason = input.reason ? String(input.reason) : 'Solicitud de contacto humano';
  const number = ctx.whatsappNumber?.replace(/[^\d]/g, '');
  const url = number
    ? `https://wa.me/${number}?text=${encodeURIComponent('Hola, vengo del chat de Luxel: ' + reason)}`
    : null;
  const hours = workingHoursStatus();
  return {
    content: hours.open
      ? 'Deriva a una persona: un asesor continuará en este mismo chat. Confírmalo brevemente al usuario y pídele que escriba su consulta aquí.'
      : 'Estamos fuera del horario de atención humana. Avísale al usuario que un asesor le responderá en horario hábil y que puede dejar su mensaje aquí mismo; no prometas respuesta inmediata.',
    handoff: true,
    widget: {
      kind: 'handoff',
      whatsappUrl: url,
      withinHours: hours.open,
      openHour: hours.openHour,
      closeHour: hours.closeHour,
    },
  };
}
