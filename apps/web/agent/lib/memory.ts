import { defineMemoryProvider } from 'eve/memory';
import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { recallHost, recallPlaybook, recallProperty } from '@luxel/core/agent/recall';
import { accessSecrets, deleteNote, upsertNote } from '@luxel/core/agent/store';
import { hostScopeKey, propertyScopeKey } from '@luxel/core/agent/scope';

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((part) =>
        part && typeof part === 'object' && 'text' in part
          ? String((part as { text?: unknown }).text ?? '')
          : '',
      )
      .join(' ');
  }
  return '';
}

function queryOf(ctx: { turn?: { input?: unknown } | null }): string {
  const input = ctx.turn?.input;
  if (!Array.isArray(input)) return textOf(input).slice(0, 400);
  return input
    .filter((m): m is { role: string; content: unknown } => Boolean(m) && typeof m === 'object')
    .filter((m) => m.role === 'user')
    .map((m) => textOf(m.content))
    .join(' ')
    .trim()
    .slice(0, 400);
}

function scopeValue(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

export function playbookMemory() {
  return defineMemoryProvider({
    recall: {
      async 'turn.started'() {
        return { messages: await recallPlaybook() };
      },
    },
  });
}

export function propertyMemory() {
  return defineMemoryProvider({
    recall: {
      async 'turn.started'(ctx) {
        const propertyId = scopeValue(ctx.memory.scope.value);
        if (!propertyId) return null;
        return { messages: await recallProperty(propertyId, queryOf(ctx)) };
      },
    },
    async tools(ctx) {
      const propertyId = scopeValue(ctx.memory.scope.value);
      if (!propertyId) return null;
      return {
        remember: defineTool({
          description:
            'Guarda un hecho duradero de ESTE alojamiento para conversaciones futuras. Solo hechos reutilizables. Nunca guardes códigos de acceso, contraseñas, correos, teléfonos ni documentos.',
          inputSchema: z.object({
            key: z
              .string()
              .max(120)
              .describe(
                'Identificador estable en kebab-case. Reusa la misma key para corregir un hecho.',
              ),
            fact: z.string().max(500).describe('El hecho, en una frase.'),
          }),
          async execute(input) {
            const secrets = await accessSecrets(propertyId);
            const saved = await upsertNote({
              tier: 'property',
              scopeKey: propertyScopeKey(propertyId),
              noteKey: input.key,
              body: input.fact,
              source: 'agent',
              propertyId,
              secrets,
            });
            return { saved };
          },
        }),
        forget: defineTool({
          description: 'Borra un hecho guardado de este alojamiento por su key.',
          inputSchema: z.object({ key: z.string().max(120) }),
          async execute(input) {
            return { deleted: await deleteNote(propertyScopeKey(propertyId), input.key) };
          },
        }),
      };
    },
  });
}

export function hostMemory() {
  return defineMemoryProvider({
    recall: {
      async 'turn.started'(ctx) {
        const customerId = scopeValue(ctx.memory.scope.value);
        if (!customerId) return null;
        return { messages: await recallHost(customerId, queryOf(ctx)) };
      },
    },
    async tools(ctx) {
      const customerId = scopeValue(ctx.memory.scope.value);
      if (!customerId) return null;
      return {
        remember: defineTool({
          description:
            'Guarda una preferencia duradera de este anfitrión. Nunca guardes datos sensibles ni cifras de sus ingresos.',
          inputSchema: z.object({
            key: z.string().max(120),
            fact: z.string().max(500),
          }),
          async execute(input) {
            const saved = await upsertNote({
              tier: 'host',
              scopeKey: hostScopeKey(customerId),
              noteKey: input.key,
              body: input.fact,
              source: 'agent',
            });
            return { saved };
          },
        }),
      };
    },
  });
}
