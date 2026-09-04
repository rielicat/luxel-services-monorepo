import { webUrl } from '../urls';
import { claimSession } from './session';
import { finalMessage, requestedHandoff } from './stream';
import { mintAgentToken } from './token';
import type { Surface } from './types';

export interface TurnResult {
  ok: boolean;
  reason?: 'no_token' | 'create_failed' | 'send_failed' | 'stream_failed' | 'timeout';
  sessionId?: string;
  text?: string;
  handoff?: boolean;
}

const TURN_TIMEOUT_MS = 55_000;

const MOCK_HANDOFF_RE =
  /(molest|enoj|terrible|p[ée]sim|hablar con|una persona|humano|reclamo|urgente)/i;

function devMock(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.LUXEL_DEV_MOCK === '1';
}

function mockTurn(input: DispatchInput): TurnResult {
  const handoff = MOCK_HANDOFF_RE.test(input.message);
  return {
    ok: true,
    sessionId: input.sessionId ?? undefined,
    text: handoff ? '' : 'Gracias por tu mensaje. Lo revisamos y te confirmamos.',
    handoff,
  };
}

interface DispatchInput {
  surface: Surface;
  principalId: string;
  sessionId?: string | null;
  message: string;
  propertyId?: string | null;
  threadId?: string | null;
  customerId?: string | null;
  signedIn?: boolean;
  webSessionId?: string | null;
}

function base(): string {
  return process.env.EVE_AGENT_ORIGIN?.trim().replace(/\/$/, '') || webUrl();
}

function tokenFor(input: DispatchInput): string | null {
  return mintAgentToken({
    surface: input.surface,
    principalId: input.principalId,
    signedIn: input.signedIn ?? false,
    customerId: input.customerId ?? null,
    propertyId: input.propertyId ?? null,
    threadId: input.threadId ?? null,
    webSessionId: input.webSessionId ?? null,
  });
}

export async function createAgentSession(
  input: Omit<DispatchInput, 'message'> & { message: string },
): Promise<{ ok: boolean; sessionId?: string; reason?: TurnResult['reason'] }> {
  const token = tokenFor(input);
  if (!token) return { ok: false, reason: 'no_token' };

  const res = await fetch(`${base()}/eve/v1/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ message: input.message }),
  });
  if (!res.ok) {
    console.error('agent.session_create_failed', { surface: input.surface, status: res.status });
    return { ok: false, reason: 'create_failed' };
  }
  const json = (await res.json()) as { sessionId?: string };
  if (!json.sessionId) return { ok: false, reason: 'create_failed' };

  await claimSession({
    sessionId: json.sessionId,
    principalId: input.principalId,
    surface: input.surface,
    propertyId: input.propertyId ?? null,
    threadId: input.threadId ?? null,
  });
  return { ok: true, sessionId: json.sessionId };
}

export async function runAgentTurn(input: DispatchInput): Promise<TurnResult> {
  if (devMock()) return mockTurn(input);
  const token = tokenFor(input);
  if (!token) return { ok: false, reason: 'no_token' };
  const origin = base();

  let sessionId = input.sessionId ?? null;
  let startIndex = 0;

  if (sessionId) {
    startIndex = (await tailIndex(origin, token, sessionId)) + 1;

    const sent = await fetch(`${origin}/eve/v1/session/${sessionId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: input.message, turnPolicy: 'queue' }),
    });
    if (!sent.ok) {
      if (sent.status !== 409) {
        console.error('agent.session_send_failed', { status: sent.status });
        return { ok: false, reason: 'send_failed' };
      }
      sessionId = null;
      startIndex = 0;
    }
  }

  if (!sessionId) {
    const created = await createAgentSession(input);
    if (!created.ok || !created.sessionId) return { ok: false, reason: created.reason };
    sessionId = created.sessionId;
  }

  return followTurn(origin, token, sessionId, startIndex);
}

async function tailIndex(origin: string, token: string, sessionId: string): Promise<number> {
  try {
    const res = await fetch(
      `${origin}/eve/v1/session/${sessionId}/stream?startIndex=0&includeTailIndex=1`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    const header = res.headers.get('x-eve-stream-tail-index');
    await res.body?.cancel();
    const parsed = Number(header);
    return Number.isFinite(parsed) ? parsed : -1;
  } catch {
    return -1;
  }
}

async function followTurn(
  origin: string,
  token: string,
  sessionId: string,
  startIndex: number,
): Promise<TurnResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${origin}/eve/v1/session/${sessionId}/stream?startIndex=${startIndex}`,
      {
        headers: { authorization: `Bearer ${token}` },
        signal: controller.signal,
      },
    );
    if (!res.ok || !res.body) return { ok: false, reason: 'stream_failed', sessionId };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let handoff = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let event: { type?: string; data?: Record<string, unknown> };
        try {
          event = JSON.parse(trimmed) as typeof event;
        } catch {
          continue;
        }

        if (event.type === 'actions.requested' && requestedHandoff(event.data)) handoff = true;
        if (event.type === 'message.completed') {
          text = (finalMessage(event.data) ?? text).trim();
        }
        if (event.type === 'turn.completed') {
          await reader.cancel();
          return { ok: true, sessionId, text, handoff };
        }
        if (event.type === 'turn.failed' || event.type === 'session.failed') {
          await reader.cancel();
          console.error('agent.turn_failed', { sessionId, type: event.type });
          return { ok: false, reason: 'stream_failed', sessionId };
        }
      }
    }
    return { ok: false, reason: 'stream_failed', sessionId };
  } catch (err) {
    console.error('agent.stream_error', {
      sessionId,
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: 'timeout', sessionId };
  } finally {
    clearTimeout(timer);
  }
}
