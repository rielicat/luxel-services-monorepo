import 'server-only';
import { CLEANING_REVIEW_START_PATH } from '@luxel/shared/cleaning-review';

export const REVIEW_TABLE = 'cleaning_review';

export const REVIEW_STATUS_LABEL: Record<string, string> = {
  queued: 'En cola para revisar',
  running: 'Revisando ahora',
  done: 'Revisado',
  skipped: 'Sin comparación',
  failed: 'La revisión falló',
};

export const REVIEW_STATUS_TONE: Record<string, string> = {
  queued: 'new',
  running: 'contacted',
  done: 'converted',
  skipped: 'new',
  failed: 'lost',
};

export const REVIEW_REASON_LABEL: Record<string, string> = {
  no_baseline: 'Primer inventario de esta unidad: no hay con qué comparar',
  no_inventory: 'El equipo no dejó inventario confirmado',
  no_video: 'Sin video: comparamos solo las listas',
  video_unreadable: 'No pudimos bajar el video; lo reintentamos',
  model_unavailable: 'Falta la credencial del modelo: comparamos solo las listas',
  model_failed: 'Lux no pudo leer el video; comparamos solo las listas',
  attempts_exhausted: 'Se acabaron los reintentos. Queda la comparación de listas',
};

export const FINDING_KIND_LABEL: Record<string, string> = {
  missing: 'Falta',
  damaged: 'Dañado',
  extra: 'De más',
  changed: 'Cambió',
};

export const FINDING_SOURCE_LABEL: Record<string, string> = {
  compare: 'listas',
  video: 'video',
};

export function reviewStatusLabel(value: string): string {
  return REVIEW_STATUS_LABEL[value] ?? value;
}

export function reviewStatusTone(value: string): string {
  return REVIEW_STATUS_TONE[value] ?? 'new';
}

export const REVIEW_STALE_MS = 30 * 60_000;
export const REVIEW_STALE_MINUTES = Math.round(REVIEW_STALE_MS / 60_000);

export function reviewStuck(status: string, updatedAt: string | null, now = Date.now()): boolean {
  if (status !== 'queued' && status !== 'running') return false;
  const moved = Date.parse(updatedAt ?? '');
  if (!Number.isFinite(moved)) return true;
  return now - moved > REVIEW_STALE_MS;
}

function originOf(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function workerOrigin(): string | null {
  return originOf(process.env.LUXEL_WORKER_URL) ?? originOf(process.env.WHATSAPP_WORKER_SEND_URL);
}

export async function startCleaningReview(runId: string): Promise<string | null> {
  const origin = workerOrigin();
  const token = process.env.INTERNAL_SEND_TOKEN;
  if (!origin || !token) return null;
  try {
    const res = await fetch(`${origin}${CLEANING_REVIEW_START_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-luxel-internal-token': token },
      body: JSON.stringify({ runId }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as {
      started?: unknown;
      instanceId?: string;
    } | null;
    if (body?.started !== true) return null;
    return body.instanceId ?? null;
  } catch {
    return null;
  }
}
