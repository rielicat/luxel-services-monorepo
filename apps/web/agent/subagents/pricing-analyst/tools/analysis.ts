import { defineDynamic, defineTool } from 'eve/tools';
import { z } from 'zod';
import { upsertNote, accessSecrets } from '@luxel/core/agent/store';
import { propertyScopeKey } from '@luxel/core/agent/scope';
import { PLAYBOOK_SCOPE } from '@luxel/core/agent/types';
import { callTool } from '../../../lib/bridge';

const ANALYST = {
  surface: 'analyst' as const,
  principalId: 'pricing-analyst',
  signedIn: false,
  customerId: null,
  propertyId: null,
  threadId: null,
};

export default defineDynamic({
  events: {
    'turn.started': () => ({
      pricing_reference: defineTool({
        description:
          'Referencia de mercado con datos reales de las propiedades que administra Luxel. Devuelve tarifa media por noche, ocupación e ingresos, o te dice que no hay muestra suficiente.',
        inputSchema: z.object({
          comuna: z.string().max(80).optional(),
          bedrooms: z.number().int().min(0).max(20).optional(),
        }),
        execute: (input) => callTool('pricing_reference', input, ANALYST),
        toModelOutput: (output) => ({ type: 'text', value: output.content }),
      }),
      property_calendar: defineTool({
        description:
          'Ocupación real de una propiedad: noches reservadas en los próximos 90 días, ocupación de fin de semana, tarifa media realizada y huecos cortos entre reservas.',
        inputSchema: z.object({ propertyId: z.string().uuid() }),
        execute: (input) =>
          callTool('property_calendar', {}, { ...ANALYST, propertyId: input.propertyId }),
        toModelOutput: (output) => ({ type: 'text', value: output.content }),
      }),
      note: defineTool({
        description:
          'Guarda una observación para el equipo Luxel. Usa scope "property" con un propertyId, o "global" para un patrón que aplica a todas las propiedades.',
        inputSchema: z.object({
          scope: z.enum(['property', 'global']),
          propertyId: z.string().uuid().optional(),
          key: z.string().max(120).describe('Identificador estable en kebab-case.'),
          observation: z.string().max(500),
        }),
        async execute(input) {
          if (input.scope === 'global') {
            return {
              saved: await upsertNote({
                tier: 'global',
                scopeKey: PLAYBOOK_SCOPE,
                noteKey: input.key,
                body: input.observation,
                source: 'pricing',
              }),
            };
          }
          if (!input.propertyId) return { saved: false };
          const secrets = await accessSecrets(input.propertyId);
          return {
            saved: await upsertNote({
              tier: 'property',
              scopeKey: propertyScopeKey(input.propertyId),
              noteKey: input.key,
              body: input.observation,
              source: 'pricing',
              propertyId: input.propertyId,
              secrets,
            }),
          };
        },
      }),
    }),
  },
});
