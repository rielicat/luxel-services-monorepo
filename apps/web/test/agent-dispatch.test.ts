import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { verifyAgentToken } from '@luxel/core/agent/token';
import type * as DispatchModule from '@luxel/core/agent/dispatch';

const ORIGIN = 'https://agent.test';

process.env.LUXEL_AGENT_TOKEN_SECRET = 'dispatch-test-secret';
process.env.EVE_AGENT_ORIGIN = ORIGIN;
delete process.env.LUXEL_DEV_MOCK;

function aborts(signal: AbortSignal | null | undefined): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
}

function neverEnds(signal: AbortSignal | null | undefined): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('\n'));
      signal?.addEventListener('abort', () =>
        controller.error(new DOMException('Aborted', 'AbortError')),
      );
    },
  });
}

function ndjson(events: Record<string, unknown>[]): ReadableStream<Uint8Array> {
  const body = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
}

const TURN_ONE = [
  { type: 'session.started', data: {} },
  { type: 'turn.started', data: { turnId: 'turn_0' } },
  {
    type: 'message.completed',
    data: { message: 'Respuesta a la PRIMERA pregunta', finishReason: 'stop' },
  },
  { type: 'turn.completed', data: { turnId: 'turn_0' } },
];

let dispatch: typeof DispatchModule;

beforeEach(async () => {
  vi.restoreAllMocks();
  dispatch = await import('@luxel/core/agent/dispatch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runAgentTurn on an existing session', () => {
  it('refuses to answer when the stream tail cannot be read', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('includeTailIndex')) {
        return new Response(null, { status: 500 });
      }
      throw new Error(`unexpected call to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await dispatch.runAgentTurn({
      surface: 'guest',
      principalId: 'guest:thread-1',
      sessionId: 'wrun_existing',
      message: 'Segunda pregunta, distinta',
      propertyId: null,
      threadId: 'thread-1',
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('stream_failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never returns a previous turn as the answer to a new message', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('includeTailIndex')) {
        return new Response(null, { status: 200, headers: {} });
      }
      if (init?.method === 'POST') {
        return Response.json({ ok: true, sessionId: 'wrun_existing', status: 'accepted' });
      }
      return new Response(ndjson(TURN_ONE), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await dispatch.runAgentTurn({
      surface: 'guest',
      principalId: 'guest:thread-1',
      sessionId: 'wrun_existing',
      message: 'Segunda pregunta, distinta',
      propertyId: null,
      threadId: 'thread-1',
    });

    expect(result.text ?? '').not.toContain('PRIMERA');
    expect(result.ok).toBe(false);
  });

  it('reads the reply from the tail forward when the tail is known', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('includeTailIndex')) {
        return new Response(null, {
          status: 200,
          headers: { 'x-eve-stream-tail-index': '3' },
        });
      }
      if (init?.method === 'POST') {
        return Response.json({ ok: true, sessionId: 'wrun_existing', status: 'accepted' });
      }
      expect(url).toContain('startIndex=4');
      return new Response(
        ndjson([
          { type: 'turn.started', data: { turnId: 'turn_1' } },
          {
            type: 'message.completed',
            data: { message: 'Respuesta a la SEGUNDA', finishReason: 'stop' },
          },
          { type: 'turn.completed', data: { turnId: 'turn_1' } },
        ]),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await dispatch.runAgentTurn({
      surface: 'guest',
      principalId: 'guest:thread-1',
      sessionId: 'wrun_existing',
      message: 'Segunda pregunta, distinta',
      propertyId: null,
      threadId: 'thread-1',
    });

    expect(result.ok).toBe(true);
    expect(result.text).toBe('Respuesta a la SEGUNDA');
  });

  it('gives up on its own budget when the turn never completes', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('includeTailIndex')) {
        return new Response(null, { status: 200, headers: { 'x-eve-stream-tail-index': '3' } });
      }
      if (init?.method === 'POST') {
        return Response.json({ ok: true, sessionId: 'wrun_existing', status: 'accepted' });
      }
      return new Response(neverEnds(init?.signal), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const started = Date.now();
    const result = await dispatch.runAgentTurn({
      surface: 'guest',
      principalId: 'guest:thread-1',
      sessionId: 'wrun_existing',
      message: 'Segunda pregunta, distinta',
      propertyId: null,
      threadId: 'thread-1',
      budgetMs: 200,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('counts the tail probe against the budget, not only the stream', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('includeTailIndex')) return aborts(init?.signal);
      throw new Error(`unexpected call to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const started = Date.now();
    const result = await dispatch.runAgentTurn({
      surface: 'guest',
      principalId: 'guest:thread-1',
      sessionId: 'wrun_existing',
      message: 'Segunda pregunta, distinta',
      propertyId: null,
      threadId: 'thread-1',
      budgetMs: 200,
    });

    expect(result.reason).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports no_token when the signing secret is absent', async () => {
    const secret = process.env.LUXEL_AGENT_TOKEN_SECRET;
    delete process.env.LUXEL_AGENT_TOKEN_SECRET;
    try {
      const result = await dispatch.runAgentTurn({
        surface: 'guest',
        principalId: 'guest:thread-1',
        sessionId: null,
        message: 'hola',
        propertyId: null,
        threadId: 'thread-1',
      });
      expect(result.reason).toBe('no_token');
    } finally {
      process.env.LUXEL_AGENT_TOKEN_SECRET = secret;
    }
  });
});

describe('startAgentTurn', () => {
  it('creates the session and never opens a stream', async () => {
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SECRET_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
    process.env.SUPABASE_SECRET_KEY = 'service-role-test-key';
    try {
      const urls: string[] = [];
      let authorization = '';
      let payload: Record<string, unknown> = {};
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        urls.push(url);
        if (url.includes('/eve/v1/session')) {
          const headers = (init?.headers ?? {}) as Record<string, string>;
          authorization = headers.authorization ?? '';
          payload = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          return Response.json(
            { ok: true, sessionId: 'wrun_sim', status: 'accepted' },
            { status: 202 },
          );
        }
        return Response.json({});
      });
      vi.stubGlobal('fetch', fetchMock);

      const started = await dispatch.startAgentTurn({
        surface: 'guest',
        principalId: 'sim:11111111-2222-3333-4444-555555555555',
        message: 'Hola, tengo una duda',
        propertyId: null,
        threadId: '99999999-8888-7777-6666-555555555555',
        context: 'Huesped: Hola\nLux: Hola, en que te ayudo',
        simulation: true,
      });

      expect(started.ok).toBe(true);
      expect(started.sessionId).toBe('wrun_sim');
      expect(urls.some((url) => url.includes('/stream'))).toBe(false);
      expect(payload.clientContext).toContain('Huesped: Hola');

      const claims = verifyAgentToken(authorization.replace('Bearer ', ''));
      expect(claims?.simulation).toBe(true);
      expect(claims?.surface).toBe('guest');
      expect(claims?.principalId).toBe('sim:11111111-2222-3333-4444-555555555555');
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
      process.env.SUPABASE_SECRET_KEY = previousKey;
    }
  });
});
