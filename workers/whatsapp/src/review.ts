import {
  CLEANING_REVIEW_ATTEMPT_PATH,
  REVIEW_DIRECT_SWEEP_LIMIT,
  REVIEW_SWEEP_LIMIT,
  type ReviewSweepEntry,
} from '@luxel/shared/cleaning-review';
import { randomHex, timingSafeEqual } from './crypto';

export interface CleaningReviewParams {
  runId: string;
}

export interface ReviewEnv {
  INTERNAL_SEND_TOKEN?: string;
  LUXEL_APP_URL?: string;
  CLEANING_REVIEW?: Workflow<CleaningReviewParams>;
}

export type ReviewAttemptStatus = 'done' | 'skipped' | 'failed' | 'retry' | 'running' | 'unknown';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TERMINAL: readonly ReviewAttemptStatus[] = ['done', 'skipped', 'failed', 'unknown'];
const ATTEMPT_TIMEOUT_MS = 65_000;
const SWEEP_TIMEOUT_MS = 15_000;

export function isRunId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export function reviewAuthorised(env: ReviewEnv, req: Request): boolean {
  const token = req.headers.get('x-luxel-internal-token');
  return Boolean(
    env.INTERNAL_SEND_TOKEN && token && timingSafeEqual(token, env.INTERNAL_SEND_TOKEN),
  );
}

export function reviewInstanceId(runId: string): string {
  return `rev-${runId.toLowerCase()}-${Date.now().toString(36)}-${randomHex(4)}`;
}

function appOrigin(env: ReviewEnv): string | null {
  const raw = env.LUXEL_APP_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

async function postToApp<T>(
  env: ReviewEnv,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<T | null> {
  const origin = appOrigin(env);
  const token = env.INTERNAL_SEND_TOKEN;
  if (!origin || !token) return null;
  try {
    const res = await fetch(`${origin}${CLEANING_REVIEW_ATTEMPT_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-luxel-internal-token': token },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as T | null;
  } catch {
    return null;
  }
}

export async function runReviewAttempt(
  env: ReviewEnv,
  runId: string,
): Promise<ReviewAttemptStatus | null> {
  const body = await postToApp<{ status?: string }>(env, { runId }, ATTEMPT_TIMEOUT_MS);
  const status = body?.status;
  if (typeof status !== 'string') return null;
  return (
    ['done', 'skipped', 'failed', 'retry', 'running', 'unknown'] as readonly string[]
  ).includes(status)
    ? (status as ReviewAttemptStatus)
    : null;
}

export function isTerminal(status: ReviewAttemptStatus): boolean {
  return TERMINAL.includes(status);
}

export async function pendingReviewRuns(env: ReviewEnv): Promise<ReviewSweepEntry[]> {
  const body = await postToApp<{ runs?: unknown }>(
    env,
    { op: 'sweep', limit: REVIEW_SWEEP_LIMIT },
    SWEEP_TIMEOUT_MS,
  );
  const runs = body?.runs;
  if (!Array.isArray(runs)) return [];
  const out: ReviewSweepEntry[] = [];
  for (const entry of runs) {
    const row = entry as { id?: unknown; attempts?: unknown };
    if (!isRunId(row.id)) continue;
    out.push({ id: row.id, attempts: Number(row.attempts ?? 0) });
  }
  return out;
}

export async function startReviewInstance(
  env: ReviewEnv,
  runId: string,
): Promise<{ started: boolean; instanceId: string } | null> {
  const workflow = env.CLEANING_REVIEW;
  if (!workflow) return null;
  const instanceId = reviewInstanceId(runId);
  try {
    await workflow.create({ id: instanceId, params: { runId } });
    return { started: true, instanceId };
  } catch {
    return { started: false, instanceId };
  }
}

export async function handleReviewStart(req: Request, env: ReviewEnv): Promise<Response> {
  if (!reviewAuthorised(env, req)) return new Response('Unauthorized', { status: 401 });

  let body: { runId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: 'bad_json' }, { status: 400 });
  }
  if (!isRunId(body.runId)) return Response.json({ error: 'bad_run_id' }, { status: 400 });
  if (!env.CLEANING_REVIEW) {
    return Response.json({ error: 'review_unavailable' }, { status: 503 });
  }

  const started = await startReviewInstance(env, body.runId);
  if (!started?.started) {
    return Response.json({ error: 'review_not_started' }, { status: 503 });
  }
  return Response.json(started, { headers: { 'cache-control': 'no-store' } });
}

export async function driveQueuedReviews(env: ReviewEnv): Promise<number> {
  const runs = await pendingReviewRuns(env);
  if (!runs.length) return 0;
  let driven = 0;
  let direct = 0;
  for (const run of runs) {
    const started = await startReviewInstance(env, run.id);
    if (started?.started) {
      driven += 1;
      continue;
    }
    if (direct >= REVIEW_DIRECT_SWEEP_LIMIT) continue;
    direct += 1;
    const status = await runReviewAttempt(env, run.id);
    if (status) driven += 1;
  }
  return driven;
}
