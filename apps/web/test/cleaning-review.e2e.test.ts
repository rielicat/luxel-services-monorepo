import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { InventoryItem } from '@luxel/shared/cleaning-inventory';
import { REVIEW_CLAIM_MS, REVIEW_MAX_ATTEMPTS } from '@luxel/shared/cleaning-review';
import type * as ActionsModule from '../src/app/[locale]/cleaning/confirm/[token]/actions';
import type * as ReviewModule from '@luxel/core/cleaning/review';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-review-${nodeCrypto.randomUUID()}`;
delete process.env.AI_GATEWAY_API_KEY;
delete process.env.VERCEL_OIDC_TOKEN;
delete process.env.LUXEL_WORKER_URL;
delete process.env.WHATSAPP_WORKER_SEND_URL;
delete process.env.INTERNAL_SEND_TOKEN;

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: unknown) => fn }));

const plusDays = (n: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(
    new Date(Date.now() + n * 86_400_000),
  );

const items = (copas: number, extra?: Partial<InventoryItem>): InventoryItem[] => [
  { room: 'Cocina', name: 'Copas', expected: null, observed: copas, condition: 'ok', note: null },
  {
    room: 'Dormitorio',
    name: 'Almohadas',
    expected: null,
    observed: 4,
    condition: 'ok',
    note: null,
    ...extra,
  },
];

let admin: ReturnType<typeof createClient>;
let seedImportedProperty: (i: unknown) => Promise<{ ok: boolean; id?: string }>;
let actions: typeof ActionsModule;
let review: typeof ReviewModule;
let customerId: string;

beforeAll(async () => {
  if (!LIVE) return;
  seedImportedProperty = (await import('./helpers/seed')).seedImportedProperty;
  actions = await import('../src/app/[locale]/cleaning/confirm/[token]/actions');
  review = await import('@luxel/core/cleaning/review');
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  const { data } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'review@test.cl',
      full_name: 'Review Host',
    })
    .select('id')
    .single();
  customerId = data!.id as string;
});

afterEach(async () => {
  if (!LIVE || !customerId) return;
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.VERCEL_OIDC_TOKEN;
  await admin.from('properties').delete().eq('owner_id', customerId);
});

async function seedCleaning(propertyId: string, offset: number) {
  const { data } = await admin
    .from('cleanings')
    .insert({
      property_id: propertyId,
      cleaning_date: plusDays(offset),
      status: 'scheduled',
      crew_confirmed_at: new Date().toISOString(),
    })
    .select('id, confirm_token')
    .single();
  return { cleaningId: data!.id as string, token: data!.confirm_token as string };
}

async function seedStoredWalkthrough(propertyId: string, cleaningId: string) {
  const key = `walkthrough/${cleaningId}/${nodeCrypto.randomBytes(16).toString('hex')}.mp4`;
  await admin.from('cleaning_walkthrough').insert({
    cleaning_id: cleaningId,
    property_id: propertyId,
    status: 'stored',
    object_key: key,
    content_type: 'video/mp4',
    bytes: 1024,
    recorded_at: new Date().toISOString(),
  });
  return key;
}

async function rawRun(cleaningId: string) {
  const { data } = await admin
    .from('cleaning_review')
    .select('id, status, reason, attempts, findings, notified_at, updated_at')
    .eq('cleaning_id', cleaningId)
    .maybeSingle();
  return data as {
    id: string;
    status: string;
    reason: string | null;
    attempts: number;
    findings: unknown[];
    notified_at: string | null;
    updated_at: string;
  } | null;
}

const TERMINAL_STATUS = new Set(['done', 'skipped', 'failed']);
const CHAIN = ['eq', 'is', 'in', 'lt', 'order', 'limit', 'select', 'maybeSingle', 'single'];

function failedUpdate(): unknown {
  const outcome = { data: null, error: { message: 'update failed' } };
  const builder: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(outcome).then(resolve, reject),
  };
  for (const key of CHAIN) builder[key] = () => builder;
  return builder;
}

function clientThatCannotSettle(): Parameters<typeof review.runCleaningReview>[1] {
  const bind = (holder: object, key: string | symbol): unknown => {
    const value = Reflect.get(holder, key) as unknown;
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(holder)
      : value;
  };
  const proxy = new Proxy(admin as object, {
    get(target, prop) {
      if (prop !== 'from') return bind(target, prop);
      return (table: string) => {
        const query = admin.from(table) as object;
        if (table !== 'cleaning_review') return query;
        return new Proxy(query, {
          get(inner, key) {
            if (key !== 'update') return bind(inner, key);
            const update = Reflect.get(inner, key) as (...args: unknown[]) => unknown;
            return (values: Record<string, unknown>) =>
              TERMINAL_STATUS.has(String(values.status))
                ? failedUpdate()
                : update.call(inner, values);
          },
        });
      };
    },
  });
  return proxy as Parameters<typeof review.runCleaningReview>[1];
}

describe.skipIf(!LIVE)('cleaning walkthrough review (end to end)', () => {
  it('produces no findings when the property has no previous confirmed inventory', async () => {
    const property = await seedImportedProperty({ nickname: 'Depto Ñuñoa' });
    const first = await seedCleaning(property.id!, 2);

    const confirmed = await actions.confirmCleaningInventory(first.token, items(6), null, 'Equipo');
    expect(confirmed.ok).toBe(true);

    const queued = await rawRun(first.cleaningId);
    expect(queued?.status).toBe('queued');

    const result = await review.runCleaningReview(queued!.id);
    expect(result.status).toBe('skipped');
    expect(result.findings).toBe(0);

    const settled = await rawRun(first.cleaningId);
    expect(settled?.status).toBe('skipped');
    expect(settled?.reason).toBe('no_baseline');
    expect(settled?.findings).toEqual([]);
    expect(settled?.notified_at).toBeNull();
  });

  it('compares against the previous confirmed inventory and a replay appends nothing new', async () => {
    const property = await seedImportedProperty({ nickname: 'Depto Las Condes' });
    const before = await seedCleaning(property.id!, 1);
    const after = await seedCleaning(property.id!, 4);

    expect((await actions.confirmCleaningInventory(before.token, items(6), null, 'Ana')).ok).toBe(
      true,
    );
    expect(
      (
        await actions.confirmCleaningInventory(
          after.token,
          items(5, { condition: 'damaged' }),
          null,
          'Ana',
        )
      ).ok,
    ).toBe(true);

    const queued = await rawRun(after.cleaningId);
    const first = await review.runCleaningReview(queued!.id);
    expect(first.status).toBe('done');
    expect(first.findings).toBe(2);

    const settled = await rawRun(after.cleaningId);
    expect(settled?.status).toBe('done');
    expect(settled?.reason).toBe('no_video');
    expect(settled?.findings).toHaveLength(2);

    const replay = await review.runCleaningReview(queued!.id);
    expect(replay.status).toBe('done');
    expect(replay.findings).toBe(2);

    const afterReplay = await rawRun(after.cleaningId);
    expect(afterReplay?.findings).toHaveLength(2);
    expect(afterReplay?.findings).toEqual(settled?.findings);
    expect(afterReplay?.updated_at).toBe(settled?.updated_at);
    expect(afterReplay?.notified_at).toBe(settled?.notified_at);
    expect(afterReplay?.attempts).toBe(settled?.attempts);
  });

  it('leaves a failed model call retryable, then visible, then retryable again', async () => {
    const property = await seedImportedProperty({ nickname: 'Depto Providencia' });
    const before = await seedCleaning(property.id!, 1);
    const after = await seedCleaning(property.id!, 5);

    expect((await actions.confirmCleaningInventory(before.token, items(6), null, 'Ana')).ok).toBe(
      true,
    );
    await seedStoredWalkthrough(property.id!, after.cleaningId);
    expect((await actions.confirmCleaningInventory(after.token, items(5), null, 'Ana')).ok).toBe(
      true,
    );

    process.env.AI_GATEWAY_API_KEY = 'test-key-not-used';
    const run = await rawRun(after.cleaningId);

    for (let attempt = 1; attempt < REVIEW_MAX_ATTEMPTS; attempt += 1) {
      const outcome = await review.runCleaningReview(run!.id);
      expect(outcome.status).toBe('retry');
      const row = await rawRun(after.cleaningId);
      expect(row?.status).toBe('queued');
      expect(row?.reason).toBe('video_unreadable');
      expect(row?.attempts).toBe(attempt);
      expect(row?.findings).toEqual([]);
    }

    const exhausted = await review.runCleaningReview(run!.id);
    expect(exhausted.status).toBe('failed');
    const failedRow = await rawRun(after.cleaningId);
    expect(failedRow?.status).toBe('failed');
    expect(failedRow?.reason).toBe('attempts_exhausted');
    expect(failedRow?.attempts).toBe(REVIEW_MAX_ATTEMPTS);
    expect((failedRow?.findings ?? []).length).toBeGreaterThan(0);

    const settledReplay = await review.runCleaningReview(run!.id);
    expect(settledReplay.status).toBe('failed');
    expect((await rawRun(after.cleaningId))?.attempts).toBe(REVIEW_MAX_ATTEMPTS);

    const requeued = await review.requeueCleaningReview(run!.id);
    expect(requeued?.status).toBe('queued');
    expect(requeued?.attempts).toBe(0);

    const sweep = await review.sweepReviewRuns();
    expect(sweep.some((entry) => entry.id === run!.id)).toBe(true);
  });

  it('stays retryable when the terminal write fails, and settles on a later attempt', async () => {
    const property = await seedImportedProperty({ nickname: 'Depto Las Condes' });
    const before = await seedCleaning(property.id!, 1);
    const after = await seedCleaning(property.id!, 7);

    expect((await actions.confirmCleaningInventory(before.token, items(6), null, 'Ana')).ok).toBe(
      true,
    );
    expect((await actions.confirmCleaningInventory(after.token, items(5), null, 'Ana')).ok).toBe(
      true,
    );

    const run = await rawRun(after.cleaningId);
    const lost = await review.runCleaningReview(run!.id, clientThatCannotSettle());
    expect(lost.status).toBe('retry');

    const stuck = await rawRun(after.cleaningId);
    expect(stuck?.status).toBe('running');
    expect(stuck?.findings).toEqual([]);
    expect(stuck?.notified_at).toBeNull();
    expect(stuck?.attempts).toBe(0);

    await admin
      .from('cleaning_review')
      .update({ claimed_at: new Date(Date.now() - REVIEW_CLAIM_MS - 1_000).toISOString() })
      .eq('id', run!.id);

    const sweep = await review.sweepReviewRuns();
    expect(sweep.some((entry) => entry.id === run!.id)).toBe(true);

    const recovered = await review.runCleaningReview(run!.id);
    expect(recovered.status).toBe('done');
    const settled = await rawRun(after.cleaningId);
    expect(settled?.status).toBe('done');
    expect((settled?.findings ?? []).length).toBeGreaterThan(0);
  });

  it('never runs a review twice at once and never touches another property', async () => {
    const one = await seedImportedProperty({ nickname: 'Depto Uno' });
    const two = await seedImportedProperty({ nickname: 'Depto Dos' });
    const oneBefore = await seedCleaning(one.id!, 1);
    const oneAfter = await seedCleaning(one.id!, 6);
    const twoOnly = await seedCleaning(two.id!, 2);

    await actions.confirmCleaningInventory(oneBefore.token, items(6), null, 'Ana');
    await actions.confirmCleaningInventory(oneAfter.token, items(4), null, 'Ana');
    await actions.confirmCleaningInventory(twoOnly.token, items(9), null, 'Beto');

    const run = await rawRun(oneAfter.cleaningId);
    const [first, second] = await Promise.all([
      review.runCleaningReview(run!.id),
      review.runCleaningReview(run!.id),
    ]);
    expect([first.status, second.status]).toContain('done');
    for (const status of [first.status, second.status]) {
      expect(['done', 'running']).toContain(status);
    }

    const other = await rawRun(twoOnly.cleaningId);
    expect(other?.status).toBe('queued');
    expect(other?.findings).toEqual([]);

    const otherResult = await review.runCleaningReview(other!.id);
    expect(otherResult.status).toBe('skipped');
    expect((await rawRun(oneAfter.cleaningId))?.findings).toHaveLength(1);
  });
});
