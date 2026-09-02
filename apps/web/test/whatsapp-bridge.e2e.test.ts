import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { seedImportedProperty } from './helpers/seed';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

const OPERATOR = '+56 9 1111 2222';
const OPERATOR_DIGITS = '56911112222';
const CREW_DIGITS = '56955551234';
const CLEANING_DATE = '2027-04-10';
const APP_SECRET = 'test-app-secret';
const SEND_TOKEN = 'test-internal-token-xyz';
const WORKER_SEND_URL = 'http://worker.test/send';

process.env.WHATSAPP_WORKER_SEND_URL = WORKER_SEND_URL;
process.env.INTERNAL_SEND_TOKEN = SEND_TOKEN;
process.env.TEST_CLERK_ID = `test-bridge-${nodeCrypto.randomUUID()}`;

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: null, getToken: async () => null }),
}));
vi.mock('@/lib/analytics/server', () => ({ capture: async () => {} }));

const workerEnv = {
  WHATSAPP_VERIFY_TOKEN: 'verify-token',
  WHATSAPP_APP_SECRET: APP_SECRET,
  WHATSAPP_ACCESS_TOKEN: 'access-token',
  WHATSAPP_PHONE_NUMBER_ID: '100000000000000',
  SUPABASE_URL: SUPABASE_URL!,
  SUPABASE_SECRET_KEY: SERVICE_KEY!,
  LUXEL_OPERATOR_WHATSAPP: OPERATOR,
  INTERNAL_SEND_TOKEN: SEND_TOKEN,
};

const pending: Promise<unknown>[] = [];
const ctx = {
  waitUntil: (p: Promise<unknown>) => void pending.push(Promise.resolve(p)),
  passThroughOnException: () => {},
} as unknown as ExecutionContext;
async function drain() {
  await Promise.allSettled(pending.splice(0));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Worker = { fetch: (req: Request, env: any, ctx: any) => Promise<Response> };
let worker: Worker;
let humanPOST: (req: Request) => Promise<Response>;
let pollGET: (req: Request) => Promise<Response>;
let admin: ReturnType<typeof createClient>;
let customerId: string | null = null;
type MetaPayload = {
  type?: string;
  template?: {
    name: string;
    language: { code: string };
    components: Array<{
      type: string;
      sub_type?: string;
      index?: string;
      parameters: Array<{ type: string; text?: string; payload?: string }>;
    }>;
  };
};
let metaSends: Array<{ to: string; body: string; payload: MetaPayload }> = [];
let metaShouldFail = false;
const createdWamids: string[] = [];

function signedWebhook(payload: unknown): Request {
  const body = JSON.stringify(payload);
  const mac = nodeCrypto.createHmac('sha256', APP_SECRET).update(body).digest('hex');
  return new Request('http://worker.test/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${mac}` },
    body,
  });
}

function inbound(opts: { from: string; id: string; text: string; contextId?: string }) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '111', phone_number_id: '100000000000000' },
              contacts: [{ profile: { name: 'Tester' }, wa_id: opts.from }],
              messages: [
                {
                  from: opts.from,
                  id: opts.id,
                  timestamp: '1700000000',
                  type: 'text',
                  text: { body: opts.text },
                  ...(opts.contextId ? { context: { id: opts.contextId } } : {}),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function buttonInbound(opts: { from: string; id: string; payload: string; text?: string }) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '111', phone_number_id: '100000000000000' },
              contacts: [{ profile: { name: 'Rosa' }, wa_id: opts.from }],
              messages: [
                {
                  from: opts.from,
                  id: opts.id,
                  timestamp: '1700000000',
                  type: 'button',
                  button: { payload: opts.payload, text: opts.text ?? 'Confirmo' },
                  context: { id: 'wamid.template' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function seedScheduledCleaning(nickname: string): Promise<{ id: string; token: string }> {
  const prop = await seedImportedProperty({ nickname });
  const { data } = await admin
    .from('cleanings')
    .insert({ property_id: prop.id!, cleaning_date: CLEANING_DATE, status: 'scheduled' })
    .select('id, confirm_token')
    .single();
  return { id: data!.id as string, token: data!.confirm_token as string };
}

async function seedAnchor(sessionId: string, createdAt?: string): Promise<string> {
  const wamid = `wamid.anchor-${nodeCrypto.randomBytes(5).toString('hex')}`;
  createdWamids.push(wamid);
  await admin.from('messages').insert({
    session_id: sessionId,
    direction: 'out',
    channel: 'whatsapp',
    body: 'forwarded',
    whatsapp_message_id: wamid,
    metadata: { to_operator: true },
    ...(createdAt ? { created_at: createdAt } : {}),
  });
  return wamid;
}

async function seedHandoff(sessionId: string): Promise<void> {
  await admin.from('messages').insert({
    session_id: sessionId,
    direction: 'out',
    channel: 'web',
    body: 'Te comunico con una persona…',
    metadata: { kind: 'handoff' },
  });
}

async function callHuman(sessionId: string, message: string): Promise<Response> {
  return humanPOST(
    new Request('http://localhost/api/chat/human', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, message }),
    }),
  );
}

beforeAll(async () => {
  if (!LIVE) return;
  const realFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(WORKER_SEND_URL)) {
      return worker.fetch(new Request(url, init), workerEnv, ctx);
    }
    if (url.startsWith('https://graph.facebook.com/')) {
      const parsed = init?.body ? JSON.parse(init.body as string) : {};
      metaSends.push({ to: parsed.to, body: parsed.text?.body ?? '', payload: parsed });
      if (metaShouldFail) return new Response('upstream error', { status: 502 });
      const id = `wamid.${nodeCrypto.randomBytes(6).toString('hex')}`;
      return new Response(JSON.stringify({ messages: [{ id }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return realFetch(input, init);
  });

  worker = (await import('../../../workers/whatsapp/src/index')).default as unknown as Worker;
  humanPOST = (await import('../src/app/api/chat/human/route')).POST;
  pollGET = (await import('../src/app/api/chat/poll/route')).GET;
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });
  const { data: customer } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'bridge@test.cl',
      full_name: 'Bridge Host',
    })
    .select('id')
    .single();
  customerId = (customer?.id as string) ?? null;
});

afterAll(async () => {
  if (!LIVE || !customerId) return;
  await admin.from('customers').delete().eq('id', customerId);
});

afterEach(async () => {
  if (!LIVE) return;
  await drain();
  if (customerId) await admin.from('properties').delete().eq('owner_id', customerId);
  await admin.from('messages').delete().like('session_id', 'test-e2e-%');
  if (createdWamids.length)
    await admin.from('messages').delete().in('whatsapp_message_id', createdWamids);
  createdWamids.length = 0;
  metaSends = [];
  metaShouldFail = false;
});

describe.skipIf(!LIVE)('web ↔ WhatsApp human bridge (end to end)', () => {
  it('forwards a handoff to the operator and routes the reply back into the web chat', async () => {
    const sid = `test-e2e-roundtrip-${nodeCrypto.randomUUID()}`;
    await admin.from('messages').insert({
      session_id: sid,
      direction: 'out',
      channel: 'web',
      body: 'Te comunico con una persona…',
      metadata: { kind: 'handoff' },
    });

    const res = await humanPOST(
      new Request('http://localhost/api/chat/human', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, message: 'Quiero hablar con un humano' }),
      }),
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.forwarded).toBe(true);
    expect(metaSends.at(-1)?.to).toBe(OPERATOR_DIGITS);
    expect(metaSends.at(-1)?.body).toContain('Quiero hablar con un humano');

    const { data: anchor } = await admin
      .from('messages')
      .select('whatsapp_message_id')
      .eq('session_id', sid)
      .eq('metadata->>to_operator', 'true')
      .maybeSingle();
    expect(anchor?.whatsapp_message_id).toMatch(/^wamid\./);
    const wamid = anchor!.whatsapp_message_id as string;
    createdWamids.push(wamid);

    const replyId = `wamid.reply-${nodeCrypto.randomBytes(5).toString('hex')}`;
    createdWamids.push(replyId);
    await worker.fetch(
      signedWebhook(
        inbound({
          from: OPERATOR_DIGITS,
          id: replyId,
          text: 'Hola, con gusto te ayudo',
          contextId: wamid,
        }),
      ),
      workerEnv,
      ctx,
    );
    await drain();

    const { data: routed } = await admin
      .from('messages')
      .select('*')
      .eq('whatsapp_message_id', replyId)
      .maybeSingle();
    expect(routed).toBeTruthy();
    expect(routed!.session_id).toBe(sid);
    expect(routed!.direction).toBe('out');
    expect(routed!.channel).toBe('whatsapp');
    expect((routed!.metadata as { from_operator?: boolean }).from_operator).toBe(true);

    const poll = await pollGET(new Request(`http://localhost/api/chat/poll?sessionId=${sid}`));
    const pollJson = await poll.json();
    expect(pollJson.messages.map((m: { body: string }) => m.body)).toContain(
      'Hola, con gusto te ayudo',
    );
  });

  it('blocks /api/chat/human when the session never reached a handoff', async () => {
    const sid = `test-e2e-nohandoff-${nodeCrypto.randomUUID()}`;
    const res = await humanPOST(
      new Request('http://localhost/api/chat/human', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, message: 'hola' }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it('routes an unanchored operator reply when exactly one thread is active', async () => {
    const sid = `test-e2e-solo-${nodeCrypto.randomUUID()}`;
    await seedAnchor(sid);
    const replyId = `wamid.solo-${nodeCrypto.randomBytes(5).toString('hex')}`;
    createdWamids.push(replyId);
    await worker.fetch(
      signedWebhook(inbound({ from: OPERATOR_DIGITS, id: replyId, text: 'respuesta sin cita' })),
      workerEnv,
      ctx,
    );
    await drain();
    const { data: routed } = await admin
      .from('messages')
      .select('*')
      .eq('whatsapp_message_id', replyId)
      .maybeSingle();
    expect(routed!.session_id).toBe(sid);
    expect((routed!.metadata as { from_operator?: boolean }).from_operator).toBe(true);
  });

  it('does NOT cross-leak an unanchored operator reply while two threads are active', async () => {
    await seedAnchor(`test-e2e-A-${nodeCrypto.randomUUID()}`);
    await seedAnchor(`test-e2e-B-${nodeCrypto.randomUUID()}`);
    const replyId = `wamid.ambig-${nodeCrypto.randomBytes(5).toString('hex')}`;
    createdWamids.push(replyId);
    await worker.fetch(
      signedWebhook(inbound({ from: OPERATOR_DIGITS, id: replyId, text: 'ambigua' })),
      workerEnv,
      ctx,
    );
    await drain();
    const { data: stored } = await admin
      .from('messages')
      .select('*')
      .eq('whatsapp_message_id', replyId)
      .maybeSingle();
    expect(stored!.direction).toBe('in');
    expect(stored!.session_id).toBeNull();
    expect((stored!.metadata as { from_operator?: boolean }).from_operator ?? false).toBe(false);
  });

  it('is idempotent when Meta redelivers the same operator reply', async () => {
    const sid = `test-e2e-idem-${nodeCrypto.randomUUID()}`;
    const anchor = await seedAnchor(sid);
    const replyId = `wamid.idem-${nodeCrypto.randomBytes(5).toString('hex')}`;
    createdWamids.push(replyId);
    const deliver = () =>
      worker.fetch(
        signedWebhook(
          inbound({ from: OPERATOR_DIGITS, id: replyId, text: 'una vez', contextId: anchor }),
        ),
        workerEnv,
        ctx,
      );
    await deliver();
    await drain();
    await deliver();
    await drain();
    const { count } = await admin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('whatsapp_message_id', replyId);
    expect(count).toBe(1);
  });

  it('rejects /send without the shared token and accepts it with', async () => {
    const noToken = await worker.fetch(
      new Request(WORKER_SEND_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'hola' }),
      }),
      workerEnv,
      ctx,
    );
    expect(noToken.status).toBe(401);

    const ok = await worker.fetch(
      new Request(WORKER_SEND_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-luxel-internal-token': SEND_TOKEN },
        body: JSON.stringify({ text: 'hola operador' }),
      }),
      workerEnv,
      ctx,
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).wamid).toMatch(/^wamid\./);
  });

  it('rejects a webhook with an invalid signature', async () => {
    const body = JSON.stringify(inbound({ from: '56999999999', id: 'wamid.bad', text: 'hi' }));
    const res = await worker.fetch(
      new Request('http://worker.test/webhook', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=deadbeef' },
        body,
      }),
      workerEnv,
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it('does NOT route an unanchored reply when an older thread is still within the wide window', async () => {
    const fifteenMinAgo = new Date(Date.now() - 15 * 60_000).toISOString();
    await seedAnchor(`test-e2e-old-${nodeCrypto.randomUUID()}`, fifteenMinAgo);
    await seedAnchor(`test-e2e-new-${nodeCrypto.randomUUID()}`);
    const replyId = `wamid.aged-${nodeCrypto.randomBytes(5).toString('hex')}`;
    createdWamids.push(replyId);
    await worker.fetch(
      signedWebhook(inbound({ from: OPERATOR_DIGITS, id: replyId, text: 'sin cita' })),
      workerEnv,
      ctx,
    );
    await drain();
    const { data: stored } = await admin
      .from('messages')
      .select('*')
      .eq('whatsapp_message_id', replyId)
      .maybeSingle();
    expect(stored!.direction).toBe('in');
    expect(stored!.session_id).toBeNull();
  });

  it('routes a non-text operator reply as a placeholder', async () => {
    const sid = `test-e2e-media-${nodeCrypto.randomUUID()}`;
    const anchor = await seedAnchor(sid);
    const replyId = `wamid.voice-${nodeCrypto.randomBytes(5).toString('hex')}`;
    createdWamids.push(replyId);
    await worker.fetch(
      signedWebhook({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'e',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '111', phone_number_id: '100000000000000' },
                  messages: [
                    {
                      from: OPERATOR_DIGITS,
                      id: replyId,
                      timestamp: '1700000000',
                      type: 'audio',
                      context: { id: anchor },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
      workerEnv,
      ctx,
    );
    await drain();
    const { data: routed } = await admin
      .from('messages')
      .select('*')
      .eq('whatsapp_message_id', replyId)
      .maybeSingle();
    expect(routed!.session_id).toBe(sid);
    expect((routed!.metadata as { from_operator?: boolean }).from_operator).toBe(true);
    expect(routed!.body).toContain('[mensaje de voz]');
  });

  it("resolves a reply that quotes the operator's own earlier reply, even with another thread active", async () => {
    const sid = `test-e2e-quote-${nodeCrypto.randomUUID()}`;
    const anchor = await seedAnchor(sid);
    const firstReply = `wamid.first-${nodeCrypto.randomBytes(5).toString('hex')}`;
    createdWamids.push(firstReply);
    await worker.fetch(
      signedWebhook(
        inbound({ from: OPERATOR_DIGITS, id: firstReply, text: 'primera', contextId: anchor }),
      ),
      workerEnv,
      ctx,
    );
    await drain();
    await seedAnchor(`test-e2e-other-${nodeCrypto.randomUUID()}`);
    const followUp = `wamid.follow-${nodeCrypto.randomBytes(5).toString('hex')}`;
    createdWamids.push(followUp);
    await worker.fetch(
      signedWebhook(
        inbound({ from: OPERATOR_DIGITS, id: followUp, text: 'segunda', contextId: firstReply }),
      ),
      workerEnv,
      ctx,
    );
    await drain();
    const { data: routed } = await admin
      .from('messages')
      .select('*')
      .eq('whatsapp_message_id', followUp)
      .maybeSingle();
    expect(routed!.session_id).toBe(sid);
    expect((routed!.metadata as { from_operator?: boolean }).from_operator).toBe(true);
  });

  it('enforces the per-session cap atomically under concurrency', async () => {
    const sid = `test-e2e-burst-${nodeCrypto.randomUUID()}`;
    await seedHandoff(sid);
    const N = 20;
    await Promise.all(Array.from({ length: N }, (_, i) => callHuman(sid, `msg ${i}`)));
    await drain();
    const { count } = await admin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sid)
      .eq('metadata->>kind', 'human');
    expect(count).toBe(12);
  });

  it('counts a failed forward against the cap and still stores the user message', async () => {
    const sid = `test-e2e-failsend-${nodeCrypto.randomUUID()}`;
    await seedHandoff(sid);
    metaShouldFail = true;
    const res = await callHuman(sid, 'no llega');
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.forwarded).toBe(false);
    const { count } = await admin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sid)
      .eq('metadata->>kind', 'human');
    expect(count).toBe(1);
  });
  it('sends an approved template to any number, with parameters a template accepts', async () => {
    const res = await worker.fetch(
      new Request(WORKER_SEND_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-luxel-internal-token': SEND_TOKEN },
        body: JSON.stringify({
          to: '+56 9 8765 4321',
          template: {
            kind: 'concierge_arrival',
            params: [
              'del 29 de agosto al 02 de septiembre',
              'Depto. 204',
              'Calle 1045',
              'sí',
              '2',
              'Ana · 11.111.111-1\nBeto · 22.222.222-2',
            ],
          },
        }),
      }),
      workerEnv,
      ctx,
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { wamid: string }).wamid).toMatch(/^wamid\./);
    const last = metaSends.at(-1)!;
    expect(last.to).toBe('56987654321');
    expect(last.payload.type).toBe('template');
    expect(last.payload.template?.name).toBe('luxel_conserje_registro');
    expect(last.payload.template?.language.code).toBe('es');
    const texts = last.payload.template!.components[0]!.parameters.map((p) => p.text);
    expect(texts).toHaveLength(6);
    expect(texts[5]).toBe('Ana · 11.111.111-1 · Beto · 22.222.222-2');
  });

  it('refuses a template it does not know, and a send with nowhere to go', async () => {
    const send = (body: unknown, env: Record<string, unknown> = workerEnv) =>
      worker.fetch(
        new Request(WORKER_SEND_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-luxel-internal-token': SEND_TOKEN },
          body: JSON.stringify(body),
        }),
        env,
        ctx,
      );
    expect(
      (await send({ to: '+56 9 8765 4321', template: { kind: 'made_up', params: [] } })).status,
    ).toBe(400);
    expect(
      (await send({ text: 'hola' }, { ...workerEnv, LUXEL_OPERATOR_WHATSAPP: undefined })).status,
    ).toBe(400);
    expect(metaSends).toHaveLength(0);
  });

  it('sends the cleaning confirmation template with two quick-reply buttons', async () => {
    const token = nodeCrypto.randomUUID();
    const res = await worker.fetch(
      new Request(WORKER_SEND_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-luxel-internal-token': SEND_TOKEN },
        body: JSON.stringify({
          to: '+56 9 5555 1234',
          template: {
            kind: 'cleaning_confirm',
            params: ['martes 02 de septiembre, 11:00', 'Depto Providencia · Depto. 401'],
            buttons: [`clean:${token}:yes`, `clean:${token}:no`],
          },
        }),
      }),
      workerEnv,
      ctx,
    );
    expect(res.status).toBe(200);
    const last = metaSends.at(-1)!;
    expect(last.to).toBe(CREW_DIGITS);
    expect(last.payload.template?.name).toBe('luxel_aseo_confirmacion');
    expect(last.payload.template?.language.code).toBe('es');
    const [body, ...buttons] = last.payload.template!.components;
    expect(body!.type).toBe('body');
    expect(body!.parameters.map((p) => p.text)).toEqual([
      'martes 02 de septiembre, 11:00',
      'Depto Providencia · Depto. 401',
    ]);
    expect(buttons.map((b) => [b.type, b.sub_type, b.index, b.parameters[0]!.payload])).toEqual([
      ['button', 'quick_reply', '0', `clean:${token}:yes`],
      ['button', 'quick_reply', '1', `clean:${token}:no`],
    ]);

    const bad = await worker.fetch(
      new Request(WORKER_SEND_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-luxel-internal-token': SEND_TOKEN },
        body: JSON.stringify({
          to: '+56 9 5555 1234',
          template: { kind: 'cleaning_confirm', params: ['a', 'b'], buttons: ['x\ny'] },
        }),
      }),
      workerEnv,
      ctx,
    );
    expect(bad.status).toBe(400);
    expect(metaSends).toHaveLength(1);
  });

  it('records attendance from the Confirmo button, thanks the sender, stores no chat', async () => {
    const c = await seedScheduledCleaning('Depto Botón Sí');
    const deliver = async () => {
      const id = `wamid.btn-${nodeCrypto.randomBytes(5).toString('hex')}`;
      createdWamids.push(id);
      const res = await worker.fetch(
        signedWebhook(buttonInbound({ from: CREW_DIGITS, id, payload: `clean:${c.token}:yes` })),
        workerEnv,
        ctx,
      );
      expect(res.status).toBe(200);
      await drain();
      return id;
    };
    const id = await deliver();

    const { data: after } = await admin
      .from('cleanings')
      .select('crew_confirmed_at, crew_declined_at')
      .eq('id', c.id)
      .single();
    expect(after!.crew_confirmed_at).toBeTruthy();
    expect(after!.crew_declined_at).toBeNull();
    expect(metaSends).toHaveLength(1);
    expect(metaSends[0]).toMatchObject({ to: CREW_DIGITS, body: '¡Gracias! Aseo confirmado ✅' });

    const { count } = await admin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('whatsapp_message_id', id);
    expect(count).toBe(0);

    await deliver();
    const { data: again } = await admin
      .from('cleanings')
      .select('crew_confirmed_at')
      .eq('id', c.id)
      .single();
    expect(again!.crew_confirmed_at).toBe(after!.crew_confirmed_at);
    expect(metaSends).toHaveLength(2);
    expect(metaSends[1]!.body).toBe('¡Gracias! Aseo confirmado ✅');
  });

  it('records a decline from the No puedo button and warns the operator', async () => {
    const c = await seedScheduledCleaning('Depto Botón No');
    const id = `wamid.btn-${nodeCrypto.randomBytes(5).toString('hex')}`;
    createdWamids.push(id);
    const res = await worker.fetch(
      signedWebhook(
        buttonInbound({ from: CREW_DIGITS, id, payload: `clean:${c.token}:no`, text: 'No puedo' }),
      ),
      workerEnv,
      ctx,
    );
    expect(res.status).toBe(200);
    await drain();

    const { data: after } = await admin
      .from('cleanings')
      .select('crew_confirmed_at, crew_declined_at, status')
      .eq('id', c.id)
      .single();
    expect(after!.crew_declined_at).toBeTruthy();
    expect(after!.crew_confirmed_at).toBeNull();
    expect(after!.status).toBe('scheduled');

    expect(metaSends).toHaveLength(2);
    expect(metaSends.find((s) => s.to === CREW_DIGITS)?.body).toBe(
      'Entendido. Avisamos al anfitrión para coordinar.',
    );
    const warned = metaSends.find((s) => s.to === OPERATOR_DIGITS)!;
    expect(warned.body).toContain(CLEANING_DATE);
    expect(warned.body).toContain('Depto Botón No');
    expect(warned.body).toContain(`+${CREW_DIGITS}`);
    expect(warned.body).toContain('no puede asistir');

    const { count } = await admin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('whatsapp_message_id', id);
    expect(count).toBe(0);
  });

  it('ignores an unknown or malformed button payload and still acks', async () => {
    const c = await seedScheduledCleaning('Depto Botón Ajeno');
    for (const payload of [`clean:${nodeCrypto.randomUUID()}:yes`, 'clean:not-a-uuid:no', 'hola']) {
      const id = `wamid.btn-${nodeCrypto.randomBytes(5).toString('hex')}`;
      createdWamids.push(id);
      const res = await worker.fetch(
        signedWebhook(buttonInbound({ from: CREW_DIGITS, id, payload })),
        workerEnv,
        ctx,
      );
      expect(res.status).toBe(200);
    }
    await drain();

    const { data: after } = await admin
      .from('cleanings')
      .select('crew_confirmed_at, crew_declined_at')
      .eq('id', c.id)
      .single();
    expect(after).toEqual({ crew_confirmed_at: null, crew_declined_at: null });
    expect(metaSends).toHaveLength(0);
    const { count } = await admin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .in('whatsapp_message_id', createdWamids);
    expect(count).toBe(0);
  });
});
