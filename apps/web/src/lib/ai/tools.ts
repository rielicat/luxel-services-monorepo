import 'server-only';
import type OpenAI from 'openai';
import { workingHoursStatus } from '@/lib/working-hours';
import {
  PLAN_KEYS,
  PLAN_FIXED_CLP,
  PLAN_HYBRID_BASE_CLP,
  PLAN_HYBRID_PCT,
  PLAN_COMMISSION_PCT,
  cheapestPlan,
  isPlanKey,
  planMonthlyCost,
  type PlanKey,
} from '@/lib/plan-pricing';
import { fetchProperties } from '@/lib/host/queries';
import { listHospitableCalendar } from '@/lib/channels/hospitable';
import { hospitableAccess } from '@/lib/channels/scope';

export const clp = (n: number) => '$' + n.toLocaleString('es-CL');

export const PLAN_LABELS: Record<PlanKey, string> = {
  commission: 'Comisión',
  hybrid: 'Mixto',
  fixed: 'Fijo',
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const PLAN_PRICE_LINES: Record<PlanKey, string> = {
  commission: `${pct(PLAN_COMMISSION_PCT)} de los ingresos por reservas, sin costo fijo`,
  hybrid: `${clp(PLAN_HYBRID_BASE_CLP)} por propiedad al mes + ${pct(PLAN_HYBRID_PCT)} de los ingresos por reservas`,
  fixed: `${clp(PLAN_FIXED_CLP)} por propiedad al mes, sin comisión`,
};

type Widget =
  | {
      kind: 'airbnb_quote';
      listings: number;
      plan: PlanKey;
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
  pricing: { label: 'Ver planes y precios', href: '/calculator', style: 'primary' },
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
        description:
          'Calcula el costo mensual de la administración completa de Airbnb según el plan (fixed = Fijo, hybrid = Mixto, commission = Comisión). Úsala cuando el usuario quiere saber cuánto cuesta que Luxel administre sus propiedades. NUNCA inventes el monto. Si el usuario conoce sus ingresos mensuales por reservas, pásalos para comparar los tres planes.',
        parameters: {
          type: 'object',
          properties: {
            listings: {
              type: 'integer',
              description: 'Cantidad de propiedades/listings de Airbnb a administrar (1–50).',
            },
            plan: {
              type: 'string',
              enum: [...PLAN_KEYS],
              description:
                '"fixed" = Fijo (tarifa mensual fija); "hybrid" = Mixto (base baja + porcentaje de ingresos); "commission" = Comisión (solo porcentaje de ingresos). Si se omite, se elige el más conveniente según los ingresos.',
            },
            monthly_revenue_clp: {
              type: 'integer',
              description:
                'Ingresos mensuales estimados por reservas de UNA propiedad, en pesos chilenos. Opcional.',
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
  const plan: PlanKey = isPlanKey(input.plan)
    ? input.plan
    : revenueClp != null
      ? cheapestPlan(revenueClp)
      : 'commission';
  const perListing = (p: PlanKey) => planMonthlyCost(p, revenueClp ?? 0);
  const monthlyClp = perListing(plan) * listings;
  const per = listings === 1 ? 'la propiedad' : `${listings} propiedades`;
  const catalog = PLAN_KEYS.map((p) => `${PLAN_LABELS[p]}: ${PLAN_PRICE_LINES[p]}`).join('; ');
  const estimate =
    revenueClp != null
      ? `Con ingresos de ${clp(revenueClp)} al mes por propiedad, para ${per} el plan ${PLAN_LABELS[plan]} cuesta ${clp(monthlyClp)} al mes (IVA incluido); los otros planes: ${PLAN_KEYS.filter(
          (p) => p !== plan,
        )
          .map((p) => `${PLAN_LABELS[p]} ${clp(perListing(p) * listings)}`)
          .join(', ')}.`
      : plan === 'fixed'
        ? `Para ${per} el plan Fijo cuesta ${clp(monthlyClp)} al mes (IVA incluido), sin comisión. Los planes Comisión y Mixto dependen de los ingresos: pide el ingreso mensual estimado para compararlos.`
        : `El plan ${PLAN_LABELS[plan]} depende de los ingresos por reservas (${PLAN_PRICE_LINES[plan]}). Pide el ingreso mensual estimado por propiedad para calcular el monto.`;
  const content = `Planes por propiedad al mes (IVA incluido): ${catalog}. ${estimate} Todo incluido en los tres planes. Comunícalo con claridad e invita a comparar planes o a solicitar el suyo.`;
  if (revenueClp == null && plan !== 'fixed') return { content };
  return {
    content,
    widget: {
      kind: 'airbnb_quote',
      listings,
      plan,
      planLabel: PLAN_LABELS[plan],
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
        const priced = reserved.map((d) => d.price?.amount).filter((a): a is number => a != null);
        if (priced.length) {
          const total = priced.reduce((sum, a) => sum + Math.round(a / 100), 0);
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
