import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { AI_MODEL } from './model';
import { getAgentModelClient, modelId } from '../agent/gateway';
import { propertyScopeKey } from '../agent/scope';
import { accessSecrets, upsertNote } from '../agent/store';
import { pricingReference, propertyCalendar } from './analyst-tools';

const MAX_PROPERTIES_PER_RUN = 8;
const MAX_NOTES_PER_PROPERTY = 2;

const SYSTEM = `Eres el analista de precios de Servicios Luxel. Lees la ocupación real de una propiedad y la referencia de mercado, y dejas notas para el equipo.

Devuelve JSON con esta forma exacta:
{"notes": [{"key": string, "note": string}]}

- key: identificador estable en kebab-case. Reusa la misma key para actualizar una nota anterior.
- note: una observación accionable sobre precio u ocupación. Una idea por frase. Español, frases cortas.
- Máximo ${MAX_NOTES_PER_PROPERTY} notas.
- Usa solo las cifras que te entregan. No inventes tarifas, ocupaciones ni comparables.
- Si la referencia dice que no hay muestra suficiente, no compares con el mercado.
- Si no ves nada accionable, devuelve una lista vacía.
- Nunca incluyas códigos de acceso, contraseñas, correos, teléfonos ni documentos.`;

interface Candidate {
  id: string;
  comuna: string | null;
  bedrooms: number | null;
}

async function candidates(): Promise<Candidate[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: properties } = await supabase
    .from('properties')
    .select('id, comuna, bedrooms')
    .limit(200);
  if (!properties?.length) return [];

  const { data: notes } = await supabase
    .from('lux_memory_note')
    .select('scope_key, updated_at')
    .eq('source', 'pricing')
    .order('updated_at', { ascending: false });

  const analysedAt = new Map<string, string>();
  for (const note of notes ?? []) {
    const key = note.scope_key as string;
    if (!analysedAt.has(key)) analysedAt.set(key, note.updated_at as string);
  }

  return (properties as Candidate[])
    .map((property) => ({
      property,
      seen: analysedAt.get(propertyScopeKey(property.id)) ?? '',
    }))
    .sort((a, b) => a.seen.localeCompare(b.seen))
    .slice(0, MAX_PROPERTIES_PER_RUN)
    .map((entry) => entry.property);
}

async function analyse(
  property: Candidate,
  openai: NonNullable<ReturnType<typeof getAgentModelClient>>,
): Promise<number> {
  const [calendar, reference] = await Promise.all([
    propertyCalendar(property.id),
    pricingReference({ comuna: property.comuna, bedrooms: property.bedrooms }),
  ]);

  let notes: { key?: unknown; note?: unknown }[];
  try {
    const res = await openai.chat.completions.create({
      model: modelId(AI_MODEL),
      reasoning_effort: 'none',
      response_format: { type: 'json_object' },
      max_completion_tokens: 600,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Ocupación: ${calendar.content}\nMercado: ${reference.content}` },
      ],
    });
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}') as Record<string, unknown>;
    notes = Array.isArray(parsed.notes)
      ? (parsed.notes as { key?: unknown; note?: unknown }[])
      : [];
  } catch (err) {
    console.error('agent.pricing_failed', {
      model: modelId(AI_MODEL),
      message: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }

  const secrets = await accessSecrets(property.id);
  let written = 0;
  for (const note of notes.slice(0, MAX_NOTES_PER_PROPERTY)) {
    if (typeof note?.key !== 'string' || typeof note?.note !== 'string') continue;
    const saved = await upsertNote({
      tier: 'property',
      scopeKey: propertyScopeKey(property.id),
      noteKey: note.key.slice(0, 120),
      body: note.note,
      source: 'pricing',
      propertyId: property.id,
      secrets,
    });
    if (saved) written += 1;
  }
  return written;
}

export async function runPricingPass(): Promise<{
  ok: boolean;
  reason?: string;
  properties: number;
  notes: number;
}> {
  const targets = await candidates();
  if (!targets.length) return { ok: true, properties: 0, notes: 0 };

  const openai = getAgentModelClient();
  if (!openai) return { ok: false, reason: 'no_ai', properties: targets.length, notes: 0 };

  let notes = 0;
  for (const property of targets) notes += await analyse(property, openai);
  return { ok: true, properties: targets.length, notes };
}
