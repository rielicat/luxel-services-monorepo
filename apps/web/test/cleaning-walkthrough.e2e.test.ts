import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type * as ActionsModule from '../src/app/[locale]/cleaning/confirm/[token]/actions';
import type * as InventoryModule from '@luxel/core/cleaning/inventory';
import type * as RouteModule from '../src/app/api/cleaning/inventory/route';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-walkthrough-${nodeCrypto.randomUUID()}`;
process.env.WHATSAPP_WORKER_SEND_URL = 'http://worker.test/send';
process.env.INTERNAL_SEND_TOKEN = 'test-internal-token';

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: unknown) => fn }));

const WORKER = 'http://worker.test';
const OBJECT_ENDPOINT = 'http://worker.test/cleaning-media/object';
const OBJECT_URL = `${OBJECT_ENDPOINT}?ticket=v2.sealed-read-ticket`;
const GEMINI = 'https://generativelanguage.googleapis.com';
const UPLOAD_SESSION = 'https://upload.test/session';
const VIDEO = new Uint8Array(2048).fill(7);

const MODEL_JSON = JSON.stringify({
  items: [
    { room: 'Living', name: 'Cojines', expected: 4, observed: 3, condition: 'missing', note: '' },
    { room: 'Cocina', name: 'Tazas', observed: 6, condition: 'ok' },
    { name: '', room: 'Baño', observed: 2, condition: 'ok' },
  ],
  differences: [
    { room: 'Living', name: 'Cojines', kind: 'missing', detail: 'Falta un cojín' },
    { kind: 'nonsense' },
  ],
});

const calls: string[] = [];
let mintedKey = '';
let modelStatus = 200;
let modelBody = MODEL_JSON;

const plusDays = (n: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(
    new Date(Date.now() + n * 86_400_000),
  );

let admin: ReturnType<typeof createClient>;
let seedImportedProperty: (i: unknown) => Promise<{ ok: boolean; id?: string }>;
let actions: typeof ActionsModule;
let inventory: typeof InventoryModule;
let route: typeof RouteModule;
let customerId: string;

function stubFetch() {
  const realFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);

    if (url === `${WORKER}/cleaning-media/upload-url`) {
      const body = JSON.parse((init?.body as string) ?? '{}') as {
        cleaningId: string;
        contentType: string;
      };
      const extension = body.contentType === 'video/webm' ? 'webm' : 'mp4';
      mintedKey = `walkthrough/${body.cleaningId}/${nodeCrypto.randomBytes(16).toString('hex')}.${extension}`;
      return Response.json({
        key: mintedKey,
        uploadUrl: `${WORKER}/cleaning-media/object?ticket=v2.sealed-put-ticket`,
        ticket: 'v2.sealed-put-ticket',
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
        maxBytes: 33_554_432,
      });
    }
    if (url === `${WORKER}/cleaning-media/read-url`) {
      return Response.json({
        url: OBJECT_URL,
        ticket: 'v2.sealed-read-ticket',
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      });
    }
    if (url === OBJECT_URL || url === OBJECT_ENDPOINT) {
      return new Response(VIDEO, { headers: { 'content-type': 'video/mp4' } });
    }
    if (url.startsWith(`${GEMINI}/upload/v1beta/files`)) {
      return new Response(null, { status: 200, headers: { 'x-goog-upload-url': UPLOAD_SESSION } });
    }
    if (url === UPLOAD_SESSION) {
      return Response.json({
        file: { name: 'files/abc123', uri: `${GEMINI}/v1beta/files/abc123`, state: 'ACTIVE' },
      });
    }
    if (url.startsWith(`${GEMINI}/v1beta/interactions`)) {
      if (modelStatus !== 200) return new Response('nope', { status: modelStatus });
      return Response.json({ steps: [{ content: [{ text: modelBody }] }] });
    }
    if (url.startsWith(`${GEMINI}/v1beta/files/`)) {
      return Response.json({ name: 'files/abc123', uri: `${GEMINI}/v1beta/files/abc123` });
    }
    return realFetch(input, init);
  });
}

beforeAll(async () => {
  if (!LIVE) return;
  stubFetch();
  seedImportedProperty = (await import('./helpers/seed')).seedImportedProperty;
  actions = await import('../src/app/[locale]/cleaning/confirm/[token]/actions');
  inventory = await import('@luxel/core/cleaning/inventory');
  route = await import('../src/app/api/cleaning/inventory/route');
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  const { data } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'walkthrough@test.cl',
      full_name: 'Walkthrough Host',
    })
    .select('id')
    .single();
  customerId = data!.id as string;
});

afterEach(async () => {
  if (!LIVE || !customerId) return;
  await admin.from('properties').delete().eq('owner_id', customerId);
  calls.length = 0;
  modelStatus = 200;
  modelBody = MODEL_JSON;
  delete process.env.GOOGLE_API_KEY;
});

async function seedCleaning(nickname: string, offset = 3) {
  const property = await seedImportedProperty({ nickname });
  const { data } = await admin
    .from('cleanings')
    .insert({
      property_id: property.id!,
      cleaning_date: plusDays(offset),
      status: 'scheduled',
      crew_confirmed_at: new Date().toISOString(),
    })
    .select('id, confirm_token')
    .single();
  return {
    propertyId: property.id!,
    cleaningId: data!.id as string,
    token: data!.confirm_token as string,
  };
}

const analyse = (token: string) =>
  route.POST(
    new Request('http://localhost/api/cleaning/inventory', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    }),
  );

async function upload(token: string, contentType = 'video/mp4') {
  const ticket = await actions.startWalkthroughUpload(token, contentType, VIDEO.byteLength);
  expect(ticket.ok).toBe(true);
  return actions.finishWalkthroughUpload(
    token,
    ticket.key,
    VIDEO.byteLength,
    112,
    'Rosa del equipo',
  );
}

describe.skipIf(!LIVE)('cleaning walkthrough capture and pre-fill (end to end)', () => {
  it('mints one key per attempt, keeps a single pending row and stores the finished upload', async () => {
    const { token, cleaningId } = await seedCleaning('Depto grabado');
    const first = await actions.startWalkthroughUpload(token, 'video/mp4', VIDEO.byteLength);
    const firstKey = first.key!;
    const second = await actions.startWalkthroughUpload(token, 'video/mp4', VIDEO.byteLength);
    expect(second.key).not.toBe(firstKey);

    const { data: rows } = await admin
      .from('cleaning_walkthrough')
      .select('object_key, status')
      .eq('cleaning_id', cleaningId);
    const pending = (rows ?? []).filter((row) => row.status === 'pending');
    expect(pending).toHaveLength(1);
    expect(pending[0]!.object_key).toBe(second.key);
    expect((rows ?? []).find((row) => row.object_key === firstKey)?.status).toBe('failed');

    expect(
      await actions.finishWalkthroughUpload(token, firstKey, VIDEO.byteLength, 90, null),
    ).toEqual({ ok: false });
    expect(
      await actions.finishWalkthroughUpload(token, second.key, VIDEO.byteLength, 90, 'Rosa'),
    ).toHaveProperty('ok', true);

    const state = await inventory.readCrewState(token);
    expect(state?.walkthrough?.bytes).toBe(VIDEO.byteLength);
    expect(state?.walkthrough?.durationSeconds).toBe(90);
    expect(state?.confirmed).toBeNull();
  });

  it('refuses an oversize or unsupported recording before it leaves the phone', async () => {
    const { token } = await seedCleaning('Depto pesado', 4);
    expect(await actions.startWalkthroughUpload(token, 'video/mp4', 40 * 1024 * 1024)).toEqual({
      ok: false,
      error: 'too_large',
    });
    expect(await actions.startWalkthroughUpload(token, 'video/x-matroska', 1024)).toEqual({
      ok: false,
      error: 'unsupported',
    });
    expect(await actions.startWalkthroughUpload(token, 'video/mp4', 0)).toEqual({
      ok: false,
      error: 'empty',
    });
  });

  it('reads the clip with the model, keeps the result a draft and never sends the object key out', async () => {
    process.env.GOOGLE_API_KEY = 'test-google-key';
    const { token, cleaningId } = await seedCleaning('Depto con Lux', 5);
    const finished = await upload(token);
    expect(finished).toEqual({ ok: true, analysing: true });

    const pendingState = await inventory.readCrewState(token);
    expect(pendingState?.draft?.status).toBe('pending');

    const res = await analyse(token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ready' });

    const state = await inventory.readCrewState(token);
    expect(state?.draft?.status).toBe('ready');
    expect(state?.draft?.items.map((item) => item.name)).toEqual(['Cojines', 'Tazas']);
    expect(state?.draft?.items[0]).toMatchObject({
      expected: 4,
      observed: 3,
      condition: 'missing',
    });
    expect(state?.draft?.differences).toHaveLength(1);
    expect(state?.confirmed).toBeNull();

    const { data: cleaning } = await admin
      .from('cleanings')
      .select('status')
      .eq('id', cleaningId)
      .single();
    expect(cleaning!.status).toBe('scheduled');

    expect(calls.some((url) => url.startsWith(`${GEMINI}/upload/v1beta/files`))).toBe(true);
    expect(calls.filter((url) => url.startsWith(`${GEMINI}/v1beta/files/`))).toHaveLength(1);
    expect(calls.some((url) => url.includes(state!.walkthrough!.id))).toBe(false);
    const bodies = JSON.stringify(calls);
    expect(bodies).not.toContain('walkthrough/');
    expect(calls.filter((url) => url.startsWith(GEMINI)).length).toBeGreaterThan(0);
    for (const call of calls.filter((url) => url.startsWith(GEMINI))) {
      expect(new URL(call).searchParams.get('key')).toBeNull();
    }
    for (const call of calls) {
      const ticket = new URL(call).searchParams.get('ticket');
      if (!ticket) continue;
      const body = ticket
        .slice(ticket.indexOf('.') + 1)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      let decoded = '';
      try {
        decoded = atob(body + '='.repeat((4 - (body.length % 4)) % 4));
      } catch {
        decoded = '';
      }
      expect(decoded).not.toContain('walkthrough/');
    }
  });

  it('marks the draft unavailable and lets the crew keep working with no model key', async () => {
    const { token } = await seedCleaning('Depto sin modelo', 6);
    expect(await upload(token)).toEqual({ ok: true, analysing: false });

    const res = await analyse(token);
    expect(await res.json()).toEqual({ status: 'unavailable' });
    const state = await inventory.readCrewState(token);
    expect(state?.draft?.status).toBe('unavailable');
    expect(state?.draft?.items).toEqual([]);
    expect(calls.some((url) => url.startsWith(GEMINI))).toBe(false);

    expect(
      await actions.confirmCleaningInventory(
        token,
        [{ room: 'Living', name: 'Cojines', observed: 4, condition: 'ok' }],
        '',
        'Rosa',
      ),
    ).toEqual({ ok: true, source: 'crew' });
  });

  it('falls back to a hand-written list when the model refuses or answers nothing', async () => {
    process.env.GOOGLE_API_KEY = 'test-google-key';
    const refused = await seedCleaning('Depto rechazado', 7);
    await upload(refused.token);
    modelStatus = 429;
    expect(await (await analyse(refused.token)).json()).toEqual({ status: 'failed' });
    expect((await inventory.readCrewState(refused.token))?.draft?.status).toBe('failed');

    const empty = await seedCleaning('Depto vacío', 8);
    await upload(empty.token);
    modelStatus = 200;
    modelBody = JSON.stringify({ items: [], differences: [] });
    expect(await (await analyse(empty.token)).json()).toEqual({ status: 'failed' });
    expect(
      await actions.confirmCleaningInventory(
        empty.token,
        [{ room: 'Baño', name: 'Toallas', observed: 2, condition: 'ok' }],
        '',
        'Rosa',
      ),
    ).toEqual({ ok: true, source: 'crew' });
  });

  it('refuses to analyse a cleaning with no stored video and a token that names nothing', async () => {
    process.env.GOOGLE_API_KEY = 'test-google-key';
    const { token } = await seedCleaning('Depto sin video', 9);
    expect(await (await analyse(token)).json()).toEqual({ status: 'failed' });

    const missing = await analyse(nodeCrypto.randomUUID());
    expect(missing.status).toBe(404);
    const malformed = await route.POST(
      new Request('http://localhost/api/cleaning/inventory', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'not-a-uuid' }),
      }),
    );
    expect(malformed.status).toBe(400);
  });
});
