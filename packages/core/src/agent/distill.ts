import OpenAI from 'openai';
import { AI_MODEL } from '../ai/model';
import { propertyScopeKey } from './scope';
import { accessSecrets, markDistilled, pendingDigests, upsertNote } from './store';
import { MAX_PLAYBOOK_NOTES, PLAYBOOK_SCOPE, type ConversationDigest } from './types';

const SYSTEM = `Eres el bibliotecario de Servicios Luxel. Lees resúmenes de conversaciones de muchas propiedades y destilas dos cosas.

1. Reglas globales: cómo debe comportarse Lux, válidas para cualquier propiedad. Solo patrones que se repiten. Máximo ${MAX_PLAYBOOK_NOTES}.
2. Notas por propiedad: hechos duraderos de una propiedad concreta.

Devuelve JSON con esta forma exacta:
{"global": [{"key": string, "rule": string, "weight": number}], "property": [{"propertyId": string, "key": string, "note": string}]}

- key: identificador estable en kebab-case. Reusa la misma key para actualizar una regla existente.
- weight: 0 a 100. Más alto es más importante.
- Una idea por frase. Español, frases cortas.
- No inventes cifras de mercado, precios por noche ni ocupaciones.
- Nunca incluyas códigos de acceso, contraseñas, correos, teléfonos ni documentos.
- Si no hay patrón claro, devuelve listas vacías.`;

interface Distilled {
  global: { key: string; rule: string; weight: number }[];
  property: { propertyId: string; key: string; note: string }[];
}

function getClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI();
}

function corpus(digests: readonly ConversationDigest[]): string {
  return digests
    .map((d) => {
      const facts = d.facts.length ? ` Hechos: ${d.facts.join('; ')}.` : '';
      const property = d.propertyId ? `[propiedad ${d.propertyId}] ` : '[sin propiedad] ';
      return `${property}${d.summary}${facts}`;
    })
    .join('\n');
}

export async function distillPending(): Promise<{
  ok: boolean;
  reason?: string;
  digests: number;
  globalRules: number;
  propertyNotes: number;
}> {
  const digests = await pendingDigests();
  if (!digests.length) return { ok: true, digests: 0, globalRules: 0, propertyNotes: 0 };

  const openai = getClient();
  if (!openai)
    return {
      ok: false,
      reason: 'no_ai',
      digests: digests.length,
      globalRules: 0,
      propertyNotes: 0,
    };

  let parsed: Distilled;
  try {
    const res = await openai.chat.completions.create({
      model: AI_MODEL,
      reasoning_effort: 'none',
      response_format: { type: 'json_object' },
      max_completion_tokens: 2000,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: corpus(digests) },
      ],
    });
    const raw = res.choices[0]?.message?.content ?? '{}';
    const json = JSON.parse(raw) as Record<string, unknown>;
    parsed = {
      global: Array.isArray(json.global) ? (json.global as Distilled['global']) : [],
      property: Array.isArray(json.property) ? (json.property as Distilled['property']) : [],
    };
  } catch (err) {
    console.error('agent.distill_failed', {
      model: AI_MODEL,
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      reason: 'error',
      digests: digests.length,
      globalRules: 0,
      propertyNotes: 0,
    };
  }

  const knownProperties = new Set(
    digests.map((d) => d.propertyId).filter((id): id is string => Boolean(id)),
  );

  let globalRules = 0;
  for (const rule of parsed.global.slice(0, MAX_PLAYBOOK_NOTES)) {
    if (typeof rule?.key !== 'string' || typeof rule?.rule !== 'string') continue;
    const written = await upsertNote({
      tier: 'global',
      scopeKey: PLAYBOOK_SCOPE,
      noteKey: rule.key.slice(0, 120),
      body: rule.rule,
      weight: Number.isFinite(rule.weight)
        ? Math.max(0, Math.min(100, Math.round(rule.weight)))
        : 0,
      source: 'distilled',
    });
    if (written) globalRules += 1;
  }

  let propertyNotes = 0;
  for (const note of parsed.property) {
    if (typeof note?.propertyId !== 'string' || typeof note?.note !== 'string') continue;
    if (!knownProperties.has(note.propertyId)) continue;
    const secrets = await accessSecrets(note.propertyId);
    const written = await upsertNote({
      tier: 'property',
      scopeKey: propertyScopeKey(note.propertyId),
      noteKey: typeof note.key === 'string' ? note.key.slice(0, 120) : null,
      body: note.note,
      source: 'distilled',
      propertyId: note.propertyId,
      secrets,
    });
    if (written) propertyNotes += 1;
  }

  await markDistilled(digests.map((d) => d.id));
  return { ok: true, digests: digests.length, globalRules, propertyNotes };
}
