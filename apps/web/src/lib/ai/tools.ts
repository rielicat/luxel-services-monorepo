import 'server-only';
import type OpenAI from 'openai';
import { workingHoursStatus } from '@/lib/working-hours';
import { PLAN_COMMISSION_PCT, planMonthlyCost } from '@/lib/plan-pricing';
import { fetchProperties } from '@/lib/host/queries';
import { hospitableAmountToClp, listHospitableCalendar } from '@/lib/channels/hospitable';
import { hospitableAccess } from '@/lib/channels/scope';

export const clp = (n: number) => '$' + n.toLocaleString('es-CL');

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const PLAN_LABEL = 'Plan Luxel';

export const PLAN_PRICE_LINE = `${pct(PLAN_COMMISSION_PCT)} de los ingresos por reservas, sin costo fijo`;

type Widget =
  | {
      kind: 'airbnb_quote';
      listings: number;
      planLabel: string;
      revenueClp: number | null;
      monthlyClp: number;
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
  dashboard: { label: 'Ir a mi panel', href: '/account', style: 'outline' },
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
}

export function buildTools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'get_airbnb_quote',
        description: `Calcula el cobro mensual de la administración completa de Airbnb: ${pct(PLAN_COMMISSION_PCT)} de los ingresos por reservas, IVA incluido. Úsala cuando el usuario quiere saber cuánto cuesta que Luxel administre sus propiedades. NUNCA inventes el monto: el cobro depende de los ingresos, así que si no los sabes, primero pídeselos.`,
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
                'Ingresos mensuales estimados por reservas de UNA propiedad, en pesos chilenos, sin la tarifa de limpieza. Sin este dato no hay monto que mostrar.',
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
          'Muestra 1–3 accesos directos útiles al usuario (páginas del sitio) según lo que necesita. Úsala para ofrecer el siguiente paso: ver el servicio, comparar planes, ir a sus propiedades o al panel. Elige solo los destinos relevantes.',
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

function getAirbnbQuote(input: Record<string, unknown>): ToolResult {
  const listings = Math.max(1, Math.min(50, Math.round(Number(input.listings ?? 1)) || 1));
  const rawRevenue = Number(input.monthly_revenue_clp);
  const revenueClp = Number.isFinite(rawRevenue) && rawRevenue > 0 ? Math.round(rawRevenue) : null;
  const per = listings === 1 ? 'la propiedad' : `${listings} propiedades`;
  const priceLine = `${PLAN_LABEL}: ${PLAN_PRICE_LINE}, por propiedad al mes, IVA incluido. Todo incluido.`;
  if (revenueClp == null) {
    return {
      content: `${priceLine} El cobro se calcula sobre los ingresos reales por reservas, así que todavía no hay monto. Pídele el ingreso mensual estimado por propiedad y vuelve a cotizar; no inventes ni aproximes la cifra.`,
    };
  }
  const monthlyClp = planMonthlyCost(revenueClp) * listings;
  const content = `${priceLine} Con ingresos de ${clp(revenueClp)} al mes por propiedad, para ${per} el cobro es ${clp(monthlyClp)} al mes. Airbnb le paga los ingresos directo al anfitrión y Luxel le cobra a fin de mes con el detalle. Comunícalo con claridad e invítalo a solicitar su plan.`;
  return {
    content,
    widget: {
      kind: 'airbnb_quote',
      listings,
      planLabel: PLAN_LABEL,
      revenueClp,
      monthlyClp,
    },
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
