import 'server-only';
import type OpenAI from 'openai';
import { OutOfServiceAreaError, quote, findNearestActivePoint } from '@luxel/pricing';
import { getPricingData } from '@/lib/pricing-data';
import { geocodeAddress } from '@/lib/geocode';
import { getDayAvailability } from '@/lib/availability';
import { workingHoursStatus } from '@/lib/working-hours';

export const clp = (n: number) => '$' + n.toLocaleString('es-CL');

type Frequency = 'one_time' | 'weekly' | 'biweekly' | 'monthly';
type Tools = 'customer' | 'company';

/** A structured payload forwarded to the chat widget to render rich cards / CTAs. */
export type Widget =
  | {
      kind: 'quote';
      serviceTypeSlug: string;
      squareMeters: number;
      frequency: Frequency;
      toolsProvidedBy: Tools;
      totalClp: number;
      breakdown: Record<string, number>;
      distanceKm: number;
    }
  | { kind: 'availability'; date: string; timeblocks: { timeblock: string; available: number }[] }
  | {
      kind: 'handoff';
      whatsappUrl: string | null;
      withinHours: boolean;
      openHour: number;
      closeHour: number;
    };

export interface ToolResult {
  /** Text the model relays to the user. Must be self-contained. */
  content: string;
  /** Optional rich payload for the widget UI. */
  widget?: Widget;
  handoff?: boolean;
}

export interface ToolContext {
  whatsappNumber?: string | null;
}

/** Tool schemas (OpenAI function tools) — service-type enum injected per request. */
export function buildTools(serviceSlugs: string[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
  const slugEnum = serviceSlugs.length ? serviceSlugs : ['regular', 'deep'];
  return [
    {
      type: 'function',
      function: {
        name: 'check_coverage',
        description:
          'Verifica si Servicios Luxel cubre una dirección. Llama esta función cuando el usuario pregunta si atienden en una comuna o dirección específica, antes de cotizar.',
        parameters: {
          type: 'object',
          properties: {
            address: { type: 'string', description: 'Calle y número, ej: "Av. Providencia 123".' },
            commune: { type: 'string', description: 'Comuna, ej: "Providencia".' },
          },
          required: ['address'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_quote',
        description:
          'Calcula el precio exacto de un servicio. SIEMPRE usa esta función para dar un precio; NUNCA inventes ni estimes montos. Requiere tipo de aseo, tamaño del espacio y dirección.',
        parameters: {
          type: 'object',
          properties: {
            service_type_slug: { type: 'string', enum: slugEnum, description: 'Tipo de aseo.' },
            square_meters: {
              type: 'integer',
              description: 'Tamaño del espacio en metros cuadrados (20–2000).',
            },
            address: { type: 'string', description: 'Calle y número.' },
            commune: { type: 'string', description: 'Comuna.' },
            tools_provided_by: {
              type: 'string',
              enum: ['customer', 'company'],
              description:
                '"customer" = el cliente aporta insumos; "company" = los lleva Luxel (recargo).',
            },
            frequency: {
              type: 'string',
              enum: ['one_time', 'weekly', 'biweekly', 'monthly'],
              description: 'Frecuencia del servicio; suscripciones tienen descuento.',
            },
          },
          required: [
            'service_type_slug',
            'square_meters',
            'address',
            'tools_provided_by',
            'frequency',
          ],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'check_availability',
        description:
          'Consulta los bloques (mañana/tarde) disponibles para una fecha y dirección. Úsala cuando el usuario quiere saber si hay cupo un día específico.',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD.' },
            address: { type: 'string', description: 'Calle y número.' },
            commune: { type: 'string', description: 'Comuna.' },
          },
          required: ['date', 'address'],
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
    case 'check_coverage':
      return checkCoverage(input);
    case 'get_quote':
      return getQuote(input);
    case 'check_availability':
      return checkAvailability(input);
    case 'escalate_to_human':
      return escalate(input, ctx);
    default:
      return { content: `Herramienta desconocida: ${name}` };
  }
}

async function checkCoverage(input: Record<string, unknown>): Promise<ToolResult> {
  const address = String(input.address ?? '');
  const commune = input.commune ? String(input.commune) : undefined;
  const geo = await geocodeAddress(address, commune);
  if (!geo) {
    return {
      content:
        'No pude ubicar esa dirección. Pide al usuario que la precise (calle, número y comuna).',
    };
  }
  const { operationPoints } = await getPricingData();
  const nearest = findNearestActivePoint(geo.lat, geo.lng, operationPoints);
  if (!nearest) {
    return {
      content: `La dirección "${geo.displayName}" está fuera de nuestra zona de cobertura actual. Ofrece registrar sus datos para avisarle cuando lleguemos.`,
    };
  }
  return {
    content: `Sí hay cobertura. Punto de operación más cercano: ${nearest.point.name}, a ${Math.round(nearest.distanceKm * 10) / 10} km. Puedes ofrecer cotizar.`,
  };
}

async function getQuote(input: Record<string, unknown>): Promise<ToolResult> {
  const slug = String(input.service_type_slug ?? '');
  const squareMeters = Math.round(Number(input.square_meters ?? 0));
  const address = String(input.address ?? '');
  const commune = input.commune ? String(input.commune) : undefined;
  const toolsProvidedBy = (input.tools_provided_by === 'company' ? 'company' : 'customer') as Tools;
  const frequency = (
    ['one_time', 'weekly', 'biweekly', 'monthly'].includes(String(input.frequency))
      ? input.frequency
      : 'one_time'
  ) as Frequency;

  if (!squareMeters || squareMeters < 10 || squareMeters > 2000) {
    return {
      content: 'Los metros cuadrados deben estar entre 10 y 2000. Pide el dato al usuario.',
    };
  }

  const geo = await geocodeAddress(address, commune);
  if (!geo) {
    return { content: 'No pude ubicar la dirección para cotizar. Pide calle, número y comuna.' };
  }

  const { pricingConfig, serviceTypes, operationPoints } = await getPricingData();
  const serviceType = serviceTypes.find((s) => s.slug === slug);
  if (!serviceType) {
    return {
      content: `Tipo de aseo inválido: "${slug}". Usa uno de: ${serviceTypes.map((s) => s.slug).join(', ')}.`,
    };
  }

  try {
    const q = quote({
      serviceType,
      operationPoints,
      squareMeters,
      customerLat: geo.lat,
      customerLng: geo.lng,
      toolsProvidedBy,
      frequency,
      config: pricingConfig,
    });
    const freqLabel: Record<Frequency, string> = {
      one_time: 'una vez',
      weekly: 'semanal',
      biweekly: 'quincenal',
      monthly: 'mensual',
    };
    const savings = q.breakdown.subscriptionDiscount
      ? ` (con ${clp(q.breakdown.subscriptionDiscount)} de descuento por suscripción ${freqLabel[frequency]})`
      : '';
    return {
      content: `Precio calculado: ${clp(q.totalClp)} por visita${savings}. Comunícalo con claridad e invita a agendar.`,
      widget: {
        kind: 'quote',
        serviceTypeSlug: slug,
        squareMeters,
        frequency,
        toolsProvidedBy,
        totalClp: q.totalClp,
        breakdown: q.breakdown,
        distanceKm: q.distanceKm,
      },
    };
  } catch (e) {
    if (e instanceof OutOfServiceAreaError) {
      return {
        content: `La dirección "${geo.displayName}" está fuera de la zona de cobertura. Ofrece registrar sus datos para avisarle.`,
      };
    }
    return {
      content: 'Hubo un error al calcular el precio. Sugiere reintentar o derivar a una persona.',
    };
  }
}

async function checkAvailability(input: Record<string, unknown>): Promise<ToolResult> {
  const date = String(input.date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { content: 'La fecha debe estar en formato YYYY-MM-DD. Pide una fecha concreta.' };
  }
  const address = String(input.address ?? '');
  const commune = input.commune ? String(input.commune) : undefined;
  const geo = await geocodeAddress(address, commune);
  if (!geo) return { content: 'No pude ubicar la dirección. Pide que la precise.' };

  const { operationPoints } = await getPricingData();
  const nearest = findNearestActivePoint(geo.lat, geo.lng, operationPoints);
  if (!nearest)
    return { content: 'La dirección está fuera de cobertura, no hay bloques disponibles.' };

  const day = await getDayAvailability(date, nearest.point.id);
  const label: Record<string, string> = {
    manana: 'Mañana (08:00–12:00)',
    tarde: 'Tarde (14:00–18:00)',
  };
  const lines = day.timeblocks
    .map(
      (b) =>
        `${label[b.timeblock] ?? b.timeblock}: ${b.available > 0 ? `${b.available} cupos` : 'sin cupos'}`,
    )
    .join('; ');
  return {
    content: `Disponibilidad para ${date}: ${lines}. Invita a agendar el bloque con cupo.`,
    widget: {
      kind: 'availability',
      date,
      timeblocks: day.timeblocks.map((b) => ({ timeblock: b.timeblock, available: b.available })),
    },
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
