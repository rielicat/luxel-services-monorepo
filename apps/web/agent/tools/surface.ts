import { defineDynamic, defineTool } from 'eve/tools';
import { z } from 'zod';
import { readCaller } from '../lib/caller';
import { callTool } from '../lib/bridge';

const LINK_DESTINATIONS = [
  'airbnb_service',
  'pricing',
  'account',
  'properties',
  'sign_in',
  'about',
] as const;

export default defineDynamic({
  events: {
    'session.started': (_event, ctx) => {
      const caller = readCaller(ctx.session.auth.current);
      if (!caller) return null;

      if (caller.surface === 'guest') {
        return {
          property_facts: defineTool({
            description:
              'Datos reales del alojamiento: capacidad, horarios, comodidades, reglas, acceso, wifi y el manual de la casa. Úsala antes de responder cualquier pregunta sobre el alojamiento. Nunca respondas de memoria.',
            inputSchema: z.object({}),
            execute: () => callTool('property_facts', {}, caller),
            toModelOutput: (output) => ({ type: 'text', value: output.content }),
          }),
          reservation_status: defineTool({
            description:
              'Estado real de la estadía de este huésped: fechas de llegada y salida, cantidad de personas y si el registro de huéspedes está completo.',
            inputSchema: z.object({}),
            execute: () => callTool('reservation_status', {}, caller),
            toModelOutput: (output) => ({ type: 'text', value: output.content }),
          }),
          guest_profile: defineTool({
            description:
              'Perfil del huésped que escribe: nombre, idioma de su perfil, de dónde viene y si ya se alojó antes en un alojamiento que administra Luxel. Úsala al empezar a responderle, antes de decidir el tono y el idioma.',
            inputSchema: z.object({}),
            execute: () => callTool('guest_profile', {}, caller),
            toModelOutput: (output) => ({ type: 'text', value: output.content }),
          }),
          escalate_to_luxel: defineTool({
            description:
              'Deriva la conversación a una persona del equipo Luxel. Úsala ante una queja seria, frustración, una emergencia, o cuando el huésped pide hablar con alguien.',
            inputSchema: z.object({
              reason: z.string().max(400).describe('Motivo breve de la derivación.'),
            }),
            execute: (input) => callTool('escalate_to_luxel', { reason: input.reason }, caller),
            toModelOutput: (output) => ({ type: 'text', value: output.content }),
          }),
        };
      }

      const web = {
        get_airbnb_quote: defineTool({
          description:
            'Calcula cuánto le queda al anfitrión y cuánto cobra Luxel sobre los ingresos por reservas. Úsala cuando quieren saber cuánto cuesta el servicio. NUNCA inventes el monto. Si dan un rango, pasa los dos extremos en la misma llamada; no la llames dos veces.',
          inputSchema: z.object({
            listings: z.number().int().min(1).max(50).describe('Cantidad de propiedades.'),
            monthly_revenue_clp: z
              .number()
              .int()
              .positive()
              .optional()
              .describe(
                'Ingresos mensuales por reservas de UNA propiedad, sin la tarifa de limpieza.',
              ),
            monthly_revenue_max_clp: z
              .number()
              .int()
              .positive()
              .optional()
              .describe('Extremo alto del rango, si dieron un rango.'),
          }),
          execute: (input) => callTool('get_airbnb_quote', input, caller),
          toModelOutput: (output) => ({ type: 'text', value: output.content }),
        }),
        get_pricing_reference: defineTool({
          description:
            'Referencia de mercado con datos REALES de las propiedades que Luxel administra. Úsala siempre que pregunten cuánto puede ganar una propiedad, cuánto cobrar por noche o qué ocupación esperar. Si no hay muestra suficiente te dirá qué responder. Nunca inventes una cifra.',
          inputSchema: z.object({
            comuna: z.string().max(80).optional().describe('Comuna de la propiedad.'),
            bedrooms: z
              .number()
              .int()
              .min(0)
              .max(20)
              .optional()
              .describe('Dormitorios, 0 para estudio.'),
          }),
          execute: (input) => callTool('get_pricing_reference', input, caller),
          toModelOutput: (output) => ({ type: 'text', value: output.content }),
        }),
        save_property_details: defineTool({
          description:
            'Guarda los datos de la propiedad que entrega el visitante para que el equipo Luxel prepare la propuesta de precios. Llámala apenas tengas datos reales, una sola vez por dato nuevo.',
          inputSchema: z.object({
            address: z.string().max(200).optional(),
            comuna: z.string().max(80).optional(),
            bedrooms: z.number().int().min(0).max(20).optional(),
            size_m2: z.number().int().positive().optional(),
            monthly_revenue_clp: z.number().int().positive().optional(),
            notes: z.string().max(500).optional(),
          }),
          execute: (input) => callTool('save_property_details', input, caller),
          toModelOutput: (output) => ({ type: 'text', value: output.content }),
        }),
        share_links: defineTool({
          description:
            'Muestra 1 a 3 accesos directos del sitio. Úsala para ofrecer el siguiente paso. Nunca escribas una URL en tu texto: los enlaces solo salen por esta herramienta.',
          inputSchema: z.object({
            destinations: z.array(z.enum(LINK_DESTINATIONS)).min(1).max(3),
          }),
          execute: (input) => callTool('share_links', input, caller),
          toModelOutput: (output) => ({ type: 'text', value: output.content }),
        }),
        escalate_to_human: defineTool({
          description:
            'Deriva la conversación a una persona de Servicios Luxel. Úsala cuando lo piden, ante un reclamo, o cuando el caso te supera.',
          inputSchema: z.object({ reason: z.string().max(400).optional() }),
          execute: (input) => callTool('escalate_to_human', input, caller),
          toModelOutput: (output) => ({ type: 'text', value: output.content }),
        }),
      };

      if (!caller.signedIn) return web;

      return {
        ...web,
        get_host_status: defineTool({
          description:
            'Estado REAL de las propiedades del anfitrión con sesión iniciada: propiedades conectadas, estadías próximas, ocupación e ingresos según su calendario. Úsala cuando pregunta por SUS propiedades. Nunca inventes estos datos.',
          inputSchema: z.object({}),
          execute: () => callTool('get_host_status', {}, caller),
          toModelOutput: (output) => ({ type: 'text', value: output.content }),
        }),
      };
    },
  },
});
