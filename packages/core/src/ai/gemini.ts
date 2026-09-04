import 'server-only';
import {
  INVENTORY_CONDITIONS,
  INVENTORY_DIFFERENCE_KINDS,
  INVENTORY_MAX_ITEMS,
  parseInventoryDifferences,
  parseInventoryItems,
  type InventoryDifference,
  type InventoryItem,
} from '@luxel/shared/cleaning-inventory';
import {
  REVIEW_MAX_FINDINGS,
  parseFindings,
  type ReviewFinding,
} from '@luxel/shared/cleaning-review';
import { gatewayTarget } from '../agent/gateway';

export const GEMINI_MODEL = 'google/gemini-3.5-flash-lite';

const MAX_INLINE_BYTES = 14 * 1024 * 1024;
const MAX_OUTPUT_TOKENS = 4_096;

export interface WalkthroughAnalysis {
  items: InventoryItem[];
  differences: InventoryDifference[];
  model: string;
}

export function geminiConfigured(): boolean {
  return gatewayTarget() !== null;
}

const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    room: { type: 'string' },
    name: { type: 'string' },
    expected: { type: 'integer' },
    observed: { type: 'integer' },
    condition: { type: 'string', enum: [...INVENTORY_CONDITIONS] },
    note: { type: 'string' },
  },
  required: ['room', 'name', 'observed', 'condition'],
} as const;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    items: { type: 'array', items: ITEM_SCHEMA, maxItems: INVENTORY_MAX_ITEMS },
    differences: {
      type: 'array',
      maxItems: 40,
      items: {
        type: 'object',
        properties: {
          room: { type: 'string' },
          name: { type: 'string' },
          kind: { type: 'string', enum: [...INVENTORY_DIFFERENCE_KINDS] },
          detail: { type: 'string' },
        },
        required: ['name', 'kind', 'detail'],
      },
    },
  },
  required: ['items', 'differences'],
} as const;

function prompt(baseline: readonly InventoryItem[]): string {
  const lines = [
    'Eres el revisor de inventario de una empresa que administra arriendos cortos.',
    'Este video es el recorrido que hace la persona de aseo cuando termina de limpiar.',
    'Recorre el video y arma el inventario de lo que ves.',
    'Agrupa cada cosa por el espacio donde aparece.',
    'Cuenta solo lo que se ve. Si no alcanzas a contar, deja la cantidad que estimas.',
    'La condición es: ok, dirty, damaged, missing o extra.',
    'Escribe los nombres de los espacios y de las cosas en español de Chile.',
    'No describas a las personas. No copies documentos, pantallas, claves ni códigos.',
    'No inventes cosas que no aparecen en el video.',
  ];
  if (baseline.length) {
    lines.push(
      'Este es el inventario confirmado la vez anterior en la misma unidad.',
      'Úsalo como referencia: llena "expected" con esa cantidad cuando corresponda.',
      'En "differences" anota lo que falta, lo que está dañado y lo que apareció de más.',
      JSON.stringify(
        baseline.map((item) => ({
          room: item.room,
          name: item.name,
          count: item.observed,
          condition: item.condition,
        })),
      ),
    );
  } else {
    lines.push(
      'No hay inventario anterior para esta unidad.',
      'Deja "expected" vacío y deja "differences" vacío, salvo que veas algo roto o sucio.',
    );
  }
  return lines.join('\n');
}

function readText(payload: unknown): string {
  const choices = (payload as { choices?: unknown } | null)?.choices;
  if (!Array.isArray(choices)) return '';
  for (const choice of choices) {
    const value = (choice as { message?: { content?: unknown } } | null)?.message?.content;
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

export type ModelOutcome =
  | { ok: true; value: unknown }
  | { ok: false; retryable: boolean; stage: string };

const transient = (status: number) => status === 429 || status >= 500;

async function runOnVideo(input: {
  video: ArrayBuffer;
  contentType: string;
  instructions: string;
  schema: unknown;
  signal?: AbortSignal;
}): Promise<ModelOutcome> {
  const target = gatewayTarget();
  if (!target) return { ok: false, retryable: false, stage: 'no_key' };
  if (input.video.byteLength === 0) return { ok: false, retryable: false, stage: 'empty_video' };
  if (input.video.byteLength > MAX_INLINE_BYTES) {
    console.warn('cleaning.video_too_large', { bytes: input.video.byteLength });
    return { ok: false, retryable: false, stage: 'video_too_large' };
  }

  try {
    const res = await fetch(target.url, {
      method: 'POST',
      signal: input.signal,
      headers: {
        authorization: `Bearer ${target.key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: input.instructions },
              {
                type: 'file',
                file: {
                  filename: 'walkthrough',
                  media_type: input.contentType,
                  data: Buffer.from(input.video).toString('base64'),
                },
              },
            ],
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'walkthrough', schema: input.schema },
        },
      }),
    });
    if (!res.ok) {
      console.warn('cleaning.model_rejected', { status: res.status });
      return { ok: false, retryable: transient(res.status), stage: 'interaction' };
    }
    const text = readText(await res.json().catch(() => null));
    if (!text) return { ok: false, retryable: true, stage: 'empty_reply' };
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch {
      return { ok: false, retryable: true, stage: 'bad_json' };
    }
  } catch {
    return { ok: false, retryable: true, stage: 'network' };
  }
}

export async function analyseWalkthrough(input: {
  video: ArrayBuffer;
  contentType: string;
  baseline: readonly InventoryItem[];
  signal?: AbortSignal;
}): Promise<WalkthroughAnalysis | null> {
  const outcome = await runOnVideo({
    video: input.video,
    contentType: input.contentType,
    instructions: prompt(input.baseline),
    schema: RESPONSE_SCHEMA,
    signal: input.signal,
  });
  if (!outcome.ok) return null;
  const shaped = (outcome.value ?? {}) as { items?: unknown; differences?: unknown };
  return {
    items: parseInventoryItems(shaped.items),
    differences: parseInventoryDifferences(shaped.differences),
    model: GEMINI_MODEL,
  };
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      maxItems: REVIEW_MAX_FINDINGS,
      items: {
        type: 'object',
        properties: {
          room: { type: 'string' },
          name: { type: 'string' },
          kind: { type: 'string', enum: [...INVENTORY_DIFFERENCE_KINDS] },
          detail: { type: 'string' },
        },
        required: ['name', 'kind', 'detail'],
      },
    },
  },
  required: ['findings'],
} as const;

function reviewPrompt(
  baseline: readonly InventoryItem[],
  confirmed: readonly InventoryItem[],
): string {
  const shorten = (items: readonly InventoryItem[]) =>
    JSON.stringify(
      items.map((item) => ({
        room: item.room,
        name: item.name,
        count: item.observed,
        condition: item.condition,
      })),
    );
  return [
    'Eres el revisor de inventario de una empresa que administra arriendos cortos.',
    'Este video es el recorrido que hizo la persona de aseo cuando terminó de limpiar.',
    'Tu trabajo es avisar diferencias contra la vez anterior en la misma unidad.',
    'Este es el inventario confirmado la vez anterior:',
    shorten(baseline),
    'Esto es lo que el equipo confirmó hoy:',
    shorten(confirmed),
    'Mira el video y anota solo lo que un operador necesita saber.',
    'Anota daños, cosas que faltan, cosas nuevas y cambios importantes.',
    'Usa kind: missing, damaged, extra o changed.',
    'Si no ves nada relevante, devuelve la lista vacía.',
    'No inventes nada que no aparezca en el video.',
    'No describas a las personas. No copies documentos, pantallas, claves ni códigos.',
    'Escribe en español de Chile, una frase corta por diferencia.',
  ].join('\n');
}

export type WalkthroughReview =
  | { ok: true; findings: ReviewFinding[]; model: string }
  | { ok: false; retryable: boolean };

export async function reviewWalkthrough(input: {
  video: ArrayBuffer;
  contentType: string;
  baseline: readonly InventoryItem[];
  confirmed: readonly InventoryItem[];
  signal?: AbortSignal;
}): Promise<WalkthroughReview> {
  const outcome = await runOnVideo({
    video: input.video,
    contentType: input.contentType,
    instructions: reviewPrompt(input.baseline, input.confirmed),
    schema: REVIEW_SCHEMA,
    signal: input.signal,
  });
  if (!outcome.ok) return { ok: false, retryable: outcome.retryable };
  const shaped = (outcome.value ?? {}) as { findings?: unknown };
  const findings = parseFindings(shaped.findings).map((finding) => ({
    ...finding,
    source: 'video' as const,
  }));
  return { ok: true, findings, model: GEMINI_MODEL };
}
