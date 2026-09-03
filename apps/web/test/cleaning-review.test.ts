import { describe, it, expect, afterEach, vi } from 'vitest';
import type { InventoryItem } from '@luxel/shared/cleaning-inventory';
import {
  REVIEW_DIRECT_SWEEP_LIMIT,
  mergeFindings,
  sameFindings,
  type ReviewFinding,
} from '@luxel/shared/cleaning-review';
import {
  driveQueuedReviews,
  handleReviewStart,
  startReviewInstance,
  type ReviewEnv,
} from '../../../workers/whatsapp/src/review';
import { diffInventories } from '@luxel/core/cleaning/review';

const RUN_ID = '11111111-2222-4333-8444-555555555500';
const TOKEN = 'internal-token';

const item = (over: Partial<InventoryItem>): InventoryItem => ({
  room: 'Cocina',
  name: 'Copas',
  expected: null,
  observed: 6,
  condition: 'ok',
  note: null,
  ...over,
});

const kinds = (findings: readonly ReviewFinding[]) =>
  findings.map((finding) => `${finding.kind}:${finding.name}`).sort();

describe('diffInventories', () => {
  it('says nothing when the two lists match', () => {
    const list = [item({}), item({ room: 'Dormitorio', name: 'Almohadas', observed: 4 })];
    expect(diffInventories(list, list)).toHaveLength(0);
  });

  it('reports a lower count as missing and a higher count as extra', () => {
    const before = [item({ observed: 6 }), item({ name: 'Platos', observed: 4 })];
    const after = [item({ observed: 5 }), item({ name: 'Platos', observed: 6 })];
    expect(kinds(diffInventories(before, after))).toEqual(['extra:Platos', 'missing:Copas']);
  });

  it('reports a damaged item and an item the crew marked as missing', () => {
    const before = [item({}), item({ name: 'Tetera' })];
    const after = [item({ condition: 'damaged' }), item({ name: 'Tetera', condition: 'missing' })];
    expect(kinds(diffInventories(before, after))).toEqual(['damaged:Copas', 'missing:Tetera']);
  });

  it('reports an item that vanished from the list and an item that is new', () => {
    const before = [item({}), item({ name: 'Tetera' })];
    const after = [item({}), item({ name: 'Hervidor' })];
    expect(kinds(diffInventories(before, after))).toEqual(['extra:Hervidor', 'missing:Tetera']);
  });

  it('never invents a finding when the baseline is empty', () => {
    expect(diffInventories([], [item({})])).toHaveLength(1);
    expect(diffInventories([], [])).toHaveLength(0);
  });
});

describe('mergeFindings', () => {
  const compare: ReviewFinding = {
    source: 'compare',
    kind: 'missing',
    room: 'Cocina',
    name: 'Copas',
    detail: 'Antes 6, hoy 5.',
  };
  const video: ReviewFinding = {
    source: 'video',
    kind: 'missing',
    room: 'cocina',
    name: 'copas',
    detail: 'Falta una copa en el mueble.',
  };

  it('keeps the compare finding when the video repeats it', () => {
    const merged = mergeFindings([compare], [video]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.source).toBe('compare');
  });

  it('is stable, so merging the same run twice changes nothing', () => {
    const once = mergeFindings([compare], [video]);
    const twice = mergeFindings([compare], [video]);
    expect(sameFindings(once, twice)).toBe(true);
    expect(mergeFindings(once, twice)).toHaveLength(1);
  });

  it('keeps a genuinely different finding', () => {
    const other: ReviewFinding = { ...video, kind: 'damaged', name: 'Sillón', room: 'Living' };
    expect(mergeFindings([compare], [other])).toHaveLength(2);
  });
});

interface FakeWorkflow {
  create: (input: { id: string; params: unknown }) => Promise<{ id: string }>;
}

function workflowEnv(mode: 'accept' | 'reject-duplicates' | 'always-throw') {
  const created: string[] = [];
  const workflow: FakeWorkflow = {
    create: async ({ id }) => {
      if (mode === 'always-throw') throw new Error('workflow_unavailable');
      if (mode === 'reject-duplicates' && created.includes(id)) {
        throw new Error('instance already exists');
      }
      created.push(id);
      return { id };
    },
  };
  const env = {
    INTERNAL_SEND_TOKEN: TOKEN,
    LUXEL_APP_URL: 'https://app.test',
    CLEANING_REVIEW: workflow,
  } as unknown as ReviewEnv;
  return { env, created };
}

function appStub(runIds: readonly string[]) {
  const attempts: string[] = [];
  const stub = vi.fn(async (_input: unknown, init?: { body?: unknown }) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { op?: string; runId?: string };
    if (body.op === 'sweep') {
      return new Response(JSON.stringify({ runs: runIds.map((id) => ({ id, attempts: 0 })) }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    attempts.push(String(body.runId));
    return new Response(JSON.stringify({ status: 'done' }), {
      headers: { 'content-type': 'application/json' },
    });
  });
  return { stub, attempts };
}

const startRequest = (runId: string) =>
  new Request('https://worker.test/cleaning-review/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-luxel-internal-token': TOKEN },
    body: JSON.stringify({ runId }),
  });

describe('starting a review instance', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mints a fresh instance id per start, so the same run can start twice', async () => {
    const { env, created } = workflowEnv('reject-duplicates');
    const first = await startReviewInstance(env, RUN_ID);
    const second = await startReviewInstance(env, RUN_ID);
    expect(first?.started).toBe(true);
    expect(second?.started).toBe(true);
    expect(second?.instanceId).not.toBe(first?.instanceId);
    expect(created).toHaveLength(2);
  });

  it('answers the caller 200 twice for the same run, never a silent no-op', async () => {
    const { env, created } = workflowEnv('reject-duplicates');
    const first = await handleReviewStart(startRequest(RUN_ID), env);
    const second = await handleReviewStart(startRequest(RUN_ID), env);
    expect([first.status, second.status]).toEqual([200, 200]);
    const bodies = (await Promise.all([first.json(), second.json()])) as Array<{
      started?: boolean;
      instanceId?: string;
    }>;
    expect(bodies.every((body) => body.started === true)).toBe(true);
    expect(bodies[0]!.instanceId).not.toBe(bodies[1]!.instanceId);
    expect(created).toHaveLength(2);
  });

  it('answers 503 when the Workflow refuses to start, so the caller knows', async () => {
    const { env } = workflowEnv('always-throw');
    const res = await handleReviewStart(startRequest(RUN_ID), env);
    expect(res.status).toBe(503);
    expect(await res.json()).not.toHaveProperty('instanceId');
  });

  it('falls through to a direct attempt when the sweep cannot start an instance', async () => {
    const { env } = workflowEnv('always-throw');
    const { stub, attempts } = appStub([RUN_ID]);
    vi.stubGlobal('fetch', stub);
    expect(await driveQueuedReviews(env)).toBe(1);
    expect(attempts).toEqual([RUN_ID]);
  });

  it('bounds the direct fallback so one pass cannot run the whole backlog', async () => {
    const env = {
      INTERNAL_SEND_TOKEN: TOKEN,
      LUXEL_APP_URL: 'https://app.test',
    } as unknown as ReviewEnv;
    const runIds = Array.from(
      { length: REVIEW_DIRECT_SWEEP_LIMIT + 4 },
      (_value, index) => `${RUN_ID.slice(0, -2)}${String(index).padStart(2, '0')}`,
    );
    const { stub, attempts } = appStub(runIds);
    vi.stubGlobal('fetch', stub);
    expect(await driveQueuedReviews(env)).toBe(REVIEW_DIRECT_SWEEP_LIMIT);
    expect(attempts).toEqual(runIds.slice(0, REVIEW_DIRECT_SWEEP_LIMIT));
  });
});
