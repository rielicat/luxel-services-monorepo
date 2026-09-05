import { describe, it, expect, beforeAll } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { AGENT_TOKEN_TTL_SECONDS, mintAgentToken, verifyAgentToken } from '@luxel/core/agent/token';
import type * as StoreModule from '@luxel/core/agent/store';
import type * as RecallModule from '@luxel/core/agent/recall';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-memory-${nodeCrypto.randomUUID()}`;
delete process.env.OPENAI_API_KEY;

let admin: ReturnType<typeof createClient>;
let store: typeof StoreModule;
let recall: typeof RecallModule;
let propertyScopeKey: (id: string) => string;
let propertyA: string;
let propertyB: string;
let customerId: string;

async function seedProperty(nickname: string): Promise<string> {
  const { data } = await admin
    .from('properties')
    .insert({ owner_id: customerId, nickname, comuna: 'Providencia' })
    .select('id')
    .single();
  return data!.id as string;
}

beforeAll(async () => {
  if (!LIVE) return;
  store = await import('@luxel/core/agent/store');
  recall = await import('@luxel/core/agent/recall');
  propertyScopeKey = (await import('@luxel/core/agent/scope')).propertyScopeKey;

  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });
  const { data: customer } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'memory@test.cl',
      full_name: 'Memory Host',
    })
    .select('id')
    .single();
  customerId = customer!.id as string;
  propertyA = await seedProperty('Memoria A');
  propertyB = await seedProperty('Memoria B');
});

describe.runIf(LIVE)('agent memory', () => {
  it('strips contacts and known secrets before a note is stored', async () => {
    await admin
      .from('property_access')
      .insert({ property_id: propertyA, method: 'keyless', keyless_code: '481516' });

    const saved = await store.upsertNote({
      tier: 'property',
      scopeKey: propertyScopeKey(propertyA),
      noteKey: 'contacto-y-codigo',
      body: 'El código es 481516, escribe a hola@luxel.cl o al +56 9 1234 5678.',
      propertyId: propertyA,
      secrets: await store.accessSecrets(propertyA),
    });
    expect(saved).toBe(true);

    const { data } = await admin
      .from('lux_memory_note')
      .select('body')
      .eq('scope_key', propertyScopeKey(propertyA))
      .eq('note_key', 'contacto-y-codigo')
      .single();

    const body = data!.body as string;
    expect(body).not.toContain('481516');
    expect(body).not.toContain('hola@luxel.cl');
    expect(body).not.toContain('1234 5678');
    expect(body).toContain('[dato de acceso]');
    expect(body).toContain('[correo]');
  });

  it('keeps one property scope out of another', async () => {
    await store.upsertNote({
      tier: 'property',
      scopeKey: propertyScopeKey(propertyA),
      noteKey: 'estacionamiento',
      body: 'El estacionamiento es el número 12 del subterráneo.',
      propertyId: propertyA,
    });

    const own = await recall.recallProperty(propertyA, 'estacionamiento');
    expect(own[0]?.content).toContain('estacionamiento');

    const other = await recall.recallProperty(propertyB, 'estacionamiento');
    expect(other[0]?.content ?? '').not.toContain('subterráneo');
  });

  it('falls back to global digests when a property has no history', async () => {
    await admin.from('lux_conversation_digest').insert({
      session_id: `sess-${nodeCrypto.randomUUID()}`,
      operation_id: `op-${nodeCrypto.randomUUID()}`,
      surface: 'guest',
      property_id: propertyA,
      summary: 'El huésped preguntó por la lavadora y se le explicó el ciclo corto.',
      facts: [],
    });

    const fresh = await seedProperty('Memoria C');
    const messages = await recall.recallProperty(fresh, 'lavadora');
    expect(messages[0]?.content ?? '').toContain('GENÉRICA');
  });

  it('recalls the global playbook with a stable id', async () => {
    await store.upsertNote({
      tier: 'global',
      scopeKey: 'global',
      noteKey: 'tono-breve',
      body: 'Responde en dos frases cuando la pregunta es simple.',
      weight: 90,
      source: 'distilled',
    });
    const messages = await recall.recallPlaybook();
    expect(messages[0]?.id).toBe('lux-playbook');
    expect(messages[0]?.content).toContain('dos frases');
  });

  it('refuses more than the allowed sessions per principal in the window', async () => {
    const session = await import('@luxel/core/agent/session');
    const principal = `visitor:${nodeCrypto.randomUUID()}`;
    let refusedAt = -1;

    for (let i = 0; i < session.MAX_SESSIONS_PER_WINDOW + 1; i += 1) {
      if (!(await session.claimSessionSlot(principal))) {
        refusedAt = i;
        break;
      }
      await session.claimSession({
        sessionId: `rl-${principal}-${i}`,
        principalId: principal,
        surface: 'web',
      });
    }

    expect(refusedAt).toBe(session.MAX_SESSIONS_PER_WINDOW);
    expect(await session.claimSessionSlot(`visitor:${nodeCrypto.randomUUID()}`)).toBe(true);
  });

  it('writes a conversation digest through the real capture path', async () => {
    const digest = await import('@luxel/core/agent/digest');
    const operationId = `op-${nodeCrypto.randomUUID()}`;

    const wrote = await digest.captureTurn({
      sessionId: `sess-${nodeCrypto.randomUUID()}`,
      operationId,
      surface: 'guest',
      propertyId: propertyA,
      threadId: null,
      messages: [
        { role: 'user', content: 'El codigo 481516 no me sirve, escribeme a hola@luxel.cl' },
        { role: 'assistant', content: 'Lo revisamos y te confirmamos.' },
      ],
    });
    expect(wrote).toBe(true);

    const { data } = await admin
      .from('lux_conversation_digest')
      .select('summary, surface, property_id')
      .eq('operation_id', operationId)
      .single();

    expect(data!.surface).toBe('guest');
    expect(data!.property_id).toBe(propertyA);
    expect(data!.summary as string).not.toContain('481516');
    expect(data!.summary as string).not.toContain('hola@luxel.cl');
  });

  it('is idempotent on operationId, so a replay adds no second digest', async () => {
    const digest = await import('@luxel/core/agent/digest');
    const operationId = `op-${nodeCrypto.randomUUID()}`;
    const messages = [
      { role: 'user' as const, content: 'Hay estacionamiento?' },
      { role: 'assistant' as const, content: 'Si, el numero 12.' },
    ];
    const input = {
      sessionId: `sess-${nodeCrypto.randomUUID()}`,
      operationId,
      surface: 'web' as const,
      propertyId: null,
      threadId: null,
      messages,
    };

    await digest.captureTurn(input);
    await digest.captureTurn(input);

    const { count } = await admin
      .from('lux_conversation_digest')
      .select('id', { count: 'exact', head: true })
      .eq('operation_id', operationId);
    expect(count).toBe(1);
  });
});

describe('memory recall isolation', () => {
  it('never offers a web lead conversation to a guest', async () => {
    if (!LIVE) return;
    const marker = `zafiro-${nodeCrypto.randomUUID().slice(0, 8)}`;

    await store.writeDigest({
      sessionId: `web-${marker}`,
      operationId: `web-${marker}`,
      surface: 'web',
      propertyId: null,
      threadId: null,
      summary: `El anfitrion de ${marker} recibe 2.400.000 al mes y Luxel cobra 288.000.`,
      facts: [],
      outcome: 'resuelto',
    });
    await store.writeDigest({
      sessionId: `guest-${marker}`,
      operationId: `guest-${marker}`,
      surface: 'guest',
      propertyId: propertyA,
      threadId: null,
      summary: `El huesped de ${marker} pregunto por el wifi y se le entrego la clave.`,
      facts: [],
      outcome: 'resuelto',
    });

    const guestOnly = await store.searchDigests(null, marker, 10, 'guest');
    expect(guestOnly.some((d) => d.summary.includes('huesped'))).toBe(true);
    expect(guestOnly.some((d) => d.summary.includes('anfitrion'))).toBe(false);

    const unfiltered = await store.searchDigests(null, marker, 10);
    expect(unfiltered.some((d) => d.summary.includes('anfitrion'))).toBe(true);
  });
});

describe('agent token', () => {
  it('rejects a tampered or expired token', () => {
    process.env.LUXEL_AGENT_TOKEN_SECRET = 'test-secret';
    const claims = {
      surface: 'web' as const,
      principalId: 'visitor:abc',
      signedIn: false,
      customerId: null,
      propertyId: null,
      threadId: null,
      webSessionId: null,
    };
    const minted = mintAgentToken(claims, 1_000)!;
    expect(verifyAgentToken(minted, 1_000)?.principalId).toBe('visitor:abc');
    expect(verifyAgentToken(`${minted}x`, 1_000)).toBeNull();
    expect(verifyAgentToken(minted, 1_000 + AGENT_TOKEN_TTL_SECONDS + 1)).toBeNull();
  });

  it('carries the browser session id, so the human handoff stays one conversation', () => {
    process.env.LUXEL_AGENT_TOKEN_SECRET = 'test-secret';
    const minted = mintAgentToken(
      {
        surface: 'web',
        principalId: 'visitor:abc',
        signedIn: false,
        customerId: null,
        propertyId: null,
        threadId: null,
        webSessionId: 'browser-session-1',
      },
      1_000,
    )!;
    expect(verifyAgentToken(minted, 1_000)?.webSessionId).toBe('browser-session-1');
  });

  it('mints nothing without a secret', () => {
    delete process.env.LUXEL_AGENT_TOKEN_SECRET;
    expect(
      mintAgentToken({
        surface: 'web',
        principalId: 'x',
        signedIn: false,
        customerId: null,
        propertyId: null,
        threadId: null,
        webSessionId: null,
      }),
    ).toBeNull();
  });
});
