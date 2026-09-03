import 'server-only';
import {
  CLEANING_REVIEW_START_PATH,
  REVIEW_CLAIM_MS,
  REVIEW_MAX_ATTEMPTS,
  REVIEW_SWEEP_LIMIT,
  isReviewReason,
  isReviewStatus,
  mergeFindings,
  parseFindings,
  type ReviewFinding,
  type ReviewReason,
  type ReviewStatus,
  type ReviewSweepEntry,
} from '@luxel/shared/cleaning-review';
import type { InventoryCondition, InventoryItem } from '@luxel/shared/cleaning-inventory';
import { WALKTHROUGH_MAX_BYTES } from '@luxel/shared/cleaning-media';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { geminiConfigured, reviewWalkthrough } from '../ai/gemini';
import { createWalkthroughReadUrl, walkthroughObjectRequest, workerOrigin } from './media';
import { sendWhatsAppViaWorker } from '../whatsapp/send';
import {
  confirmedInventoryItems,
  previousConfirmedRecord,
  storedWalkthrough,
  type CleaningRef,
} from './inventory';

type Supabase = ReturnType<typeof createSupabaseServiceRoleClient>;

export const REVIEW_TABLE = 'cleaning_review';

const NOTIFY_LINES = 3;
const MODEL_BUDGET_MS = 45_000;

const CONDITION_TEXT: Record<InventoryCondition, string> = {
  ok: 'bien',
  dirty: 'sucio',
  damaged: 'dañado',
  missing: 'falta',
  extra: 'de más',
};

export interface ReviewRun {
  id: string;
  cleaningId: string;
  propertyId: string;
  status: ReviewStatus;
  reason: ReviewReason | null;
  findings: ReviewFinding[];
  attempts: number;
  model: string | null;
  baselineCleaningId: string | null;
  claimedAt: string | null;
  notifiedAt: string | null;
  finishedAt: string | null;
  workflowInstanceId: string | null;
}

export type ReviewOutcome = 'done' | 'skipped' | 'failed' | 'retry' | 'running' | 'unknown';

const itemKey = (item: InventoryItem) => `${item.room.toLowerCase()}|${item.name.toLowerCase()}`;

export function diffInventories(
  baseline: readonly InventoryItem[],
  current: readonly InventoryItem[],
): ReviewFinding[] {
  const before = new Map(baseline.map((item) => [itemKey(item), item]));
  const after = new Map(current.map((item) => [itemKey(item), item]));
  const out: ReviewFinding[] = [];
  const push = (item: InventoryItem, kind: ReviewFinding['kind'], detail: string): void =>
    void out.push({ source: 'compare', kind, room: item.room, name: item.name, detail });

  for (const item of current) {
    const previous = before.get(itemKey(item));
    if (!previous) {
      push(item, 'extra', 'No estaba en el inventario anterior.');
      continue;
    }
    if (item.condition === 'missing') {
      push(item, 'missing', `El equipo lo marcó como falta. Antes había ${previous.observed}.`);
      continue;
    }
    if (item.condition === 'damaged' && previous.condition !== 'damaged') {
      push(item, 'damaged', 'El equipo lo marcó como dañado.');
      continue;
    }
    if (item.observed < previous.observed) {
      push(item, 'missing', `Antes ${previous.observed}, hoy ${item.observed}.`);
      continue;
    }
    if (item.observed > previous.observed) {
      push(item, 'extra', `Antes ${previous.observed}, hoy ${item.observed}.`);
      continue;
    }
    if (item.condition !== previous.condition && item.condition !== 'ok') {
      push(
        item,
        'changed',
        `Antes ${CONDITION_TEXT[previous.condition]}, hoy ${CONDITION_TEXT[item.condition]}.`,
      );
    }
  }

  for (const item of baseline) {
    if (after.has(itemKey(item))) continue;
    push(item, 'missing', `Antes había ${item.observed}. Hoy no aparece en la lista.`);
  }

  return out;
}

const ROW_COLUMNS =
  'id, cleaning_id, property_id, status, reason, findings, attempts, model, baseline_cleaning_id, claimed_at, notified_at, finished_at, workflow_instance_id';

function toRun(row: Record<string, unknown> | null): ReviewRun | null {
  if (!row) return null;
  const status = row.status;
  const reason = row.reason;
  return {
    id: row.id as string,
    cleaningId: row.cleaning_id as string,
    propertyId: row.property_id as string,
    status: isReviewStatus(status) ? status : 'queued',
    reason: isReviewReason(reason) ? reason : null,
    findings: parseFindings(row.findings),
    attempts: Number(row.attempts ?? 0),
    model: (row.model as string | null) ?? null,
    baselineCleaningId: (row.baseline_cleaning_id as string | null) ?? null,
    claimedAt: (row.claimed_at as string | null) ?? null,
    notifiedAt: (row.notified_at as string | null) ?? null,
    finishedAt: (row.finished_at as string | null) ?? null,
    workflowInstanceId: (row.workflow_instance_id as string | null) ?? null,
  };
}

export async function readReviewRun(runId: string, client?: Supabase): Promise<ReviewRun | null> {
  const supabase = client ?? createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from(REVIEW_TABLE)
    .select(ROW_COLUMNS)
    .eq('id', runId)
    .maybeSingle();
  return toRun(data as Record<string, unknown> | null);
}

export async function reviewRunForCleaning(
  cleaningId: string,
  client?: Supabase,
): Promise<ReviewRun | null> {
  const supabase = client ?? createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from(REVIEW_TABLE)
    .select(ROW_COLUMNS)
    .eq('cleaning_id', cleaningId)
    .maybeSingle();
  return toRun(data as Record<string, unknown> | null);
}

export async function queueCleaningReview(
  cleaning: CleaningRef,
  walkthroughId: string | null,
  client?: Supabase,
): Promise<ReviewRun | null> {
  const supabase = client ?? createSupabaseServiceRoleClient();
  const existing = await reviewRunForCleaning(cleaning.id, supabase);
  if (existing && (existing.status === 'queued' || existing.status === 'running')) return existing;

  if (existing) {
    const { data } = await supabase
      .from(REVIEW_TABLE)
      .update({
        status: 'queued',
        reason: null,
        findings: [],
        attempts: 0,
        model: null,
        baseline_cleaning_id: null,
        claimed_at: null,
        notified_at: null,
        finished_at: null,
        walkthrough_id: walkthroughId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select(ROW_COLUMNS)
      .maybeSingle();
    return toRun(data as Record<string, unknown> | null);
  }

  const { data } = await supabase
    .from(REVIEW_TABLE)
    .insert({
      cleaning_id: cleaning.id,
      property_id: cleaning.propertyId,
      walkthrough_id: walkthroughId,
      status: 'queued',
    })
    .select(ROW_COLUMNS)
    .maybeSingle();
  return toRun(data as Record<string, unknown> | null);
}

export async function requeueCleaningReview(
  runId: string,
  client?: Supabase,
): Promise<ReviewRun | null> {
  const supabase = client ?? createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from(REVIEW_TABLE)
    .update({
      status: 'queued',
      reason: null,
      attempts: 0,
      claimed_at: null,
      notified_at: null,
      finished_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId)
    .select(ROW_COLUMNS)
    .maybeSingle();
  return toRun(data as Record<string, unknown> | null);
}

export async function sweepReviewRuns(
  limit = REVIEW_SWEEP_LIMIT,
  client?: Supabase,
): Promise<ReviewSweepEntry[]> {
  const supabase = client ?? createSupabaseServiceRoleClient();
  const stale = new Date(Date.now() - REVIEW_CLAIM_MS).toISOString();
  const { data } = await supabase
    .from(REVIEW_TABLE)
    .select('id, attempts, status, claimed_at')
    .in('status', ['queued', 'running'])
    .lt('attempts', REVIEW_MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(limit);
  const rows = (data ?? []) as Array<{
    id: string;
    attempts: number;
    status: string;
    claimed_at: string | null;
  }>;
  return rows
    .filter((row) => row.status === 'queued' || !row.claimed_at || row.claimed_at < stale)
    .map((row) => ({ id: row.id, attempts: Number(row.attempts ?? 0) }));
}

export function reviewStartConfigured(): boolean {
  return Boolean(workerOrigin() && process.env.INTERNAL_SEND_TOKEN);
}

export async function startCleaningReview(
  run: ReviewRun,
  client?: Supabase,
): Promise<string | null> {
  const origin = workerOrigin();
  const token = process.env.INTERNAL_SEND_TOKEN;
  if (!origin || !token) return null;
  try {
    const res = await fetch(`${origin}${CLEANING_REVIEW_START_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-luxel-internal-token': token },
      body: JSON.stringify({ runId: run.id }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as {
      started?: unknown;
      instanceId?: string;
    } | null;
    if (body?.started !== true) return null;
    const instanceId = body.instanceId ?? null;
    if (instanceId) {
      const supabase = client ?? createSupabaseServiceRoleClient();
      await supabase
        .from(REVIEW_TABLE)
        .update({ workflow_instance_id: instanceId })
        .eq('id', run.id);
    }
    return instanceId;
  } catch {
    return null;
  }
}

async function claimReviewRun(run: ReviewRun, supabase: Supabase): Promise<boolean> {
  if (run.claimedAt && Date.now() - Date.parse(run.claimedAt) <= REVIEW_CLAIM_MS) return false;
  const guarded = supabase
    .from(REVIEW_TABLE)
    .update({ status: 'running', claimed_at: new Date().toISOString() })
    .eq('id', run.id);
  const { data } = await (
    run.claimedAt ? guarded.eq('claimed_at', run.claimedAt) : guarded.is('claimed_at', null)
  ).select('id');
  return (data?.length ?? 0) > 0;
}

async function notifyOperator(
  run: ReviewRun,
  findings: readonly ReviewFinding[],
  headline: string,
  supabase: Supabase,
): Promise<void> {
  const { data } = await supabase
    .from(REVIEW_TABLE)
    .update({ notified_at: new Date().toISOString() })
    .eq('id', run.id)
    .is('notified_at', null)
    .select('id');
  if (!(data?.length ?? 0)) return;

  const { data: property } = await supabase
    .from('properties')
    .select('nickname')
    .eq('id', run.propertyId)
    .maybeSingle();
  const { data: cleaning } = await supabase
    .from('cleanings')
    .select('cleaning_date')
    .eq('id', run.cleaningId)
    .maybeSingle();

  const lines = findings
    .slice(0, NOTIFY_LINES)
    .map(
      (finding) =>
        `• ${[finding.room, finding.name].filter(Boolean).join(' · ')}${finding.detail ? ` — ${finding.detail}` : ''}`,
    );
  const rest = findings.length - lines.length;
  const text = [
    `${headline} — ${property?.nickname ?? 'unidad'} · ${cleaning?.cleaning_date ?? ''}`.trim(),
    ...lines,
    rest > 0 ? `y ${rest} más.` : '',
    'Revisa el detalle en el panel Luxel, en Aseos.',
  ]
    .filter(Boolean)
    .join('\n');
  await sendWhatsAppViaWorker(text);
}

async function settle(
  run: ReviewRun,
  input: {
    status: Extract<ReviewStatus, 'done' | 'skipped' | 'failed'>;
    reason: ReviewReason | null;
    findings: readonly ReviewFinding[];
    model: string | null;
    baselineCleaningId: string | null;
  },
  supabase: Supabase,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(REVIEW_TABLE)
    .update({
      status: input.status,
      reason: input.reason,
      findings: input.findings,
      model: input.model,
      baseline_cleaning_id: input.baselineCleaningId,
      claimed_at: null,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', run.id)
    .select('id');
  return !error && (data?.length ?? 0) > 0;
}

async function release(
  run: ReviewRun,
  reason: ReviewReason,
  compared: readonly ReviewFinding[],
  baselineCleaningId: string,
  supabase: Supabase,
): Promise<{ status: 'retry' | 'failed'; findings: ReviewFinding[] } | null> {
  const attempts = run.attempts + 1;
  const exhausted = attempts >= REVIEW_MAX_ATTEMPTS;
  const findings = exhausted ? mergeFindings(compared) : [];
  const { data, error } = await supabase
    .from(REVIEW_TABLE)
    .update({
      status: exhausted ? 'failed' : 'queued',
      reason: exhausted ? 'attempts_exhausted' : reason,
      attempts,
      claimed_at: null,
      ...(exhausted
        ? {
            findings,
            baseline_cleaning_id: baselineCleaningId,
            finished_at: new Date().toISOString(),
          }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', run.id)
    .select('id');
  if (error || !(data?.length ?? 0)) return null;
  return { status: exhausted ? 'failed' : 'retry', findings };
}

async function fetchVideo(key: string, signal: AbortSignal): Promise<ArrayBuffer | null> {
  const ticket = await createWalkthroughReadUrl(key);
  if (!ticket) return null;
  try {
    const request = walkthroughObjectRequest(ticket);
    const res = await fetch(request.url, { signal, cache: 'no-store', headers: request.headers });
    if (!res.ok) return null;
    const body = await res.arrayBuffer();
    if (!body.byteLength || body.byteLength > WALKTHROUGH_MAX_BYTES) return null;
    return body;
  } catch {
    return null;
  }
}

export async function runCleaningReview(
  runId: string,
  client?: Supabase,
): Promise<{ status: ReviewOutcome; findings?: number }> {
  const supabase = client ?? createSupabaseServiceRoleClient();
  const run = await readReviewRun(runId, supabase);
  if (!run) return { status: 'unknown' };
  if (run.status === 'done' || run.status === 'skipped' || run.status === 'failed') {
    return { status: run.status, findings: run.findings.length };
  }
  if (!(await claimReviewRun(run, supabase))) return { status: 'running' };

  const current = await confirmedInventoryItems(run.cleaningId, supabase);
  if (!current.length) {
    const settled = await settle(
      run,
      {
        status: 'skipped',
        reason: 'no_inventory',
        findings: [],
        model: null,
        baselineCleaningId: null,
      },
      supabase,
    );
    return settled ? { status: 'skipped', findings: 0 } : { status: 'retry' };
  }

  const baseline = await previousConfirmedRecord(run.propertyId, run.cleaningId, supabase);
  if (!baseline || !baseline.items.length) {
    const settled = await settle(
      run,
      {
        status: 'skipped',
        reason: 'no_baseline',
        findings: [],
        model: null,
        baselineCleaningId: null,
      },
      supabase,
    );
    return settled ? { status: 'skipped', findings: 0 } : { status: 'retry' };
  }

  const compared = diffInventories(baseline.items, current);
  const walkthrough = await storedWalkthrough(run.cleaningId, supabase);

  if (!walkthrough || !geminiConfigured()) {
    const findings = mergeFindings(compared);
    const settled = await settle(
      run,
      {
        status: 'done',
        reason: walkthrough ? 'model_unavailable' : 'no_video',
        findings,
        model: null,
        baselineCleaningId: baseline.cleaningId,
      },
      supabase,
    );
    if (!settled) return { status: 'retry' };
    if (findings.length) await notifyOperator(run, findings, 'Diferencias en el aseo', supabase);
    return { status: 'done', findings: findings.length };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_BUDGET_MS);
  try {
    const video = await fetchVideo(walkthrough.objectKey, controller.signal);
    if (!video) {
      const outcome = await release(
        run,
        'video_unreadable',
        compared,
        baseline.cleaningId,
        supabase,
      );
      if (!outcome) return { status: 'retry' };
      if (outcome.status === 'failed') {
        await notifyOperator(run, outcome.findings, 'No pudimos leer el video del aseo', supabase);
        return { status: 'failed', findings: outcome.findings.length };
      }
      return { status: 'retry' };
    }

    const review = await reviewWalkthrough({
      video,
      contentType: walkthrough.contentType,
      baseline: baseline.items,
      confirmed: current,
      signal: controller.signal,
    });

    if (!review.ok) {
      if (!review.retryable) {
        const findings = mergeFindings(compared);
        const settled = await settle(
          run,
          {
            status: 'done',
            reason: 'model_failed',
            findings,
            model: null,
            baselineCleaningId: baseline.cleaningId,
          },
          supabase,
        );
        if (!settled) return { status: 'retry' };
        if (findings.length)
          await notifyOperator(run, findings, 'Diferencias en el aseo', supabase);
        return { status: 'done', findings: findings.length };
      }
      const outcome = await release(run, 'model_failed', compared, baseline.cleaningId, supabase);
      if (!outcome) return { status: 'retry' };
      if (outcome.status === 'failed') {
        await notifyOperator(run, outcome.findings, 'No pudimos leer el video del aseo', supabase);
        return { status: 'failed', findings: outcome.findings.length };
      }
      return { status: 'retry' };
    }

    const findings = mergeFindings(compared, review.findings);
    const settled = await settle(
      run,
      {
        status: 'done',
        reason: null,
        findings,
        model: review.model,
        baselineCleaningId: baseline.cleaningId,
      },
      supabase,
    );
    if (!settled) return { status: 'retry' };
    if (findings.length) await notifyOperator(run, findings, 'Diferencias en el aseo', supabase);
    return { status: 'done', findings: findings.length };
  } finally {
    clearTimeout(timer);
  }
}
