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

export const GEMINI_MODEL = 'gemini-3.5-flash-lite';

const API_BASE = 'https://generativelanguage.googleapis.com';
const API_REVISION = '2026-05-20';
const UPLOAD_DISPLAY_NAME = 'walkthrough';
const POLL_FIRST_MS = 500;
const POLL_MAX_MS = 4_000;
const POLL_BUDGET_MS = 30_000;

export interface WalkthroughAnalysis {
  items: InventoryItem[];
  differences: InventoryDifference[];
  model: string;
}

export function geminiConfigured(): boolean {
  return Boolean(process.env.GOOGLE_API_KEY);
}

function apiKey(): string | null {
  return process.env.GOOGLE_API_KEY?.trim() || null;
}

function authHeaders(key: string, extra?: Record<string, string>): Record<string, string> {
  return { 'x-goog-api-key': key, ...(extra ?? {}) };
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

async function startUpload(
  key: string,
  bytes: number,
  contentType: string,
  signal: AbortSignal,
): Promise<string | null> {
  const res = await fetch(`${API_BASE}/upload/v1beta/files`, {
    method: 'POST',
    signal,
    headers: authHeaders(key, {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes),
      'X-Goog-Upload-Header-Content-Type': contentType,
      'content-type': 'application/json',
    }),
    body: JSON.stringify({ file: { display_name: UPLOAD_DISPLAY_NAME } }),
  });
  if (!res.ok) return null;
  return res.headers.get('x-goog-upload-url');
}

interface UploadedFile {
  name: string;
  uri: string;
  state: string;
}

function readFile(payload: unknown): UploadedFile | null {
  const file = (payload as { file?: Record<string, unknown> } | null)?.file;
  const direct = (payload as Record<string, unknown> | null) ?? {};
  const source = file ?? direct;
  const name = typeof source.name === 'string' ? source.name : '';
  const uri = typeof source.uri === 'string' ? source.uri : '';
  const state = typeof source.state === 'string' ? source.state : '';
  if (!name || !uri) return null;
  return { name, uri, state };
}

async function finishUpload(
  url: string,
  body: ArrayBuffer,
  contentType: string,
  signal: AbortSignal,
): Promise<UploadedFile | null> {
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'content-type': contentType,
      'Content-Length': String(body.byteLength),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body,
  });
  if (!res.ok) return null;
  return readFile(await res.json().catch(() => null));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForActive(
  key: string,
  file: UploadedFile,
  signal: AbortSignal,
): Promise<{ ok: boolean; retryable: boolean }> {
  let state = file.state;
  let wait = POLL_FIRST_MS;
  const deadline = Date.now() + POLL_BUDGET_MS;
  while (Date.now() < deadline) {
    if (state === 'ACTIVE') return { ok: true, retryable: false };
    if (state === 'FAILED') return { ok: false, retryable: false };
    await sleep(wait);
    wait = Math.min(wait * 2, POLL_MAX_MS);
    if (signal.aborted) return { ok: false, retryable: true };
    const res = await fetch(`${API_BASE}/v1beta/${file.name}`, {
      signal,
      cache: 'no-store',
      headers: authHeaders(key),
    });
    if (!res.ok) return { ok: false, retryable: true };
    state = readFile(await res.json().catch(() => null))?.state ?? '';
  }
  return { ok: state === 'ACTIVE', retryable: true };
}

async function deleteFile(key: string, name: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/v1beta/${name}`, { method: 'DELETE', headers: authHeaders(key) });
  } catch {}
}

function readText(payload: unknown): string {
  const steps = (payload as { steps?: unknown } | null)?.steps;
  if (!Array.isArray(steps)) return '';
  for (const step of steps) {
    const content = (step as { content?: unknown } | null)?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const value = (part as { text?: unknown } | null)?.text;
      if (typeof value === 'string' && value.trim()) return value;
    }
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
  const key = apiKey();
  if (!key) return { ok: false, retryable: false, stage: 'no_key' };
  if (input.video.byteLength === 0) return { ok: false, retryable: false, stage: 'empty_video' };

  const controller = new AbortController();
  const abort = () => controller.abort();
  input.signal?.addEventListener('abort', abort, { once: true });
  const signal = controller.signal;

  let uploaded: UploadedFile | null = null;
  try {
    const uploadUrl = await startUpload(key, input.video.byteLength, input.contentType, signal);
    if (!uploadUrl) return { ok: false, retryable: true, stage: 'upload_start' };
    uploaded = await finishUpload(uploadUrl, input.video, input.contentType, signal);
    if (!uploaded) return { ok: false, retryable: true, stage: 'upload_finish' };
    const active = await waitForActive(key, uploaded, signal);
    if (!active.ok) return { ok: false, retryable: active.retryable, stage: 'file_state' };

    const res = await fetch(`${API_BASE}/v1beta/interactions`, {
      method: 'POST',
      signal,
      headers: authHeaders(key, {
        'content-type': 'application/json',
        'Api-Revision': API_REVISION,
      }),
      body: JSON.stringify({
        model: GEMINI_MODEL,
        store: false,
        input: [
          { type: 'video', uri: uploaded.uri, mime_type: input.contentType },
          { type: 'text', text: input.instructions },
        ],
        response_format: { type: 'text', mime_type: 'application/json', schema: input.schema },
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
  } finally {
    input.signal?.removeEventListener('abort', abort);
    if (uploaded) await deleteFile(key, uploaded.name);
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
