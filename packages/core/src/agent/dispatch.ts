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

export const AGENT_TURN_BUDGET_MS = 240_000;

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
  budgetMs?: number;
  context?: string | null;
  simulation?: boolean;
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
    ...(input.simulation ? { simulation: true } : {}),
  });
}

export async function createAgentSession(
  input: Omit<DispatchInput, 'message'> & { message: string },
  signal?: AbortSignal,
): Promise<{ ok: boolean; sessionId?: string; reason?: TurnResult['reason'] }> {
  const token = tokenFor(input);
  if (!token) {
    console.error('agent.no_token', { surface: input.surface });
    return { ok: false, reason: 'no_token' };
  }

  let res: Response;
  try {
    res = await fetch(`${base()}/eve/v1/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        message: input.message,
        ...(input.context ? { clientContext: input.context } : {}),
      }),
      signal,
    });
  } catch (err) {
    console.error('agent.session_create_error', {
      surface: input.surface,
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: signal?.aborted ? 'timeout' : 'create_failed' };
  }
  if (!res.ok) {
    console.error('agent.session_create_failed', { surface: input.surface, status: res.status });
    return { ok: false, reason: 'create_failed' };
  }
  const json = (await res.json()) as { sessionId?: string };
  if (!json.sessionId) {
    console.error('agent.session_create_no_id', { surface: input.surface, status: res.status });
    return { ok: false, reason: 'create_failed' };
  }

  await claimSession({
    sessionId: json.sessionId,
    principalId: input.principalId,
    surface: input.surface,
    propertyId: input.propertyId ?? null,
    threadId: input.threadId ?? null,
  });
  return { ok: true, sessionId: json.sessionId };
}

export async function startAgentTurn(input: Omit<DispatchInput, 'sessionId'>): Promise<{
  ok: boolean;
  sessionId?: string;
  reason?: TurnResult['reason'];
  mocked?: { text: string; handoff: boolean };
}> {
  if (devMock()) {
    const turn = mockTurn({ ...input, sessionId: null });
    return {
      ok: true,
      sessionId: `mock-${Date.now()}`,
      mocked: { text: turn.text ?? '', handoff: Boolean(turn.handoff) },
    };
  }
  return createAgentSession(input);
}

export async function runAgentTurn(input: DispatchInput): Promise<TurnResult> {
  if (devMock()) return mockTurn(input);
  const token = tokenFor(input);
  if (!token) {
    console.error('agent.no_token', { surface: input.surface });
    return { ok: false, reason: 'no_token' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.budgetMs ?? AGENT_TURN_BUDGET_MS);
  try {
    return await dispatchTurn(base(), token, input, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function dispatchTurn(
  origin: string,
  token: string,
  input: DispatchInput,
  signal: AbortSignal,
): Promise<TurnResult> {
  let sessionId = input.sessionId ?? null;
  let startIndex = 0;

  if (sessionId) {
    const tail = await tailIndex(origin, token, sessionId, signal);
    if (tail === null) {
      return { ok: false, reason: signal.aborted ? 'timeout' : 'stream_failed', sessionId };
    }
    startIndex = tail + 1;

    let sent: Response;
    try {
      sent = await fetch(`${origin}/eve/v1/session/${sessionId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: input.message, turnPolicy: 'queue' }),
        signal,
      });
    } catch (err) {
      console.error('agent.session_send_error', {
        sessionId,
        message: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, reason: signal.aborted ? 'timeout' : 'send_failed', sessionId };
    }
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
    const created = await createAgentSession(input, signal);
    if (!created.ok || !created.sessionId) return { ok: false, reason: created.reason };
    sessionId = created.sessionId;
  }

  return followTurn(origin, token, sessionId, startIndex, signal);
}

async function tailIndex(
  origin: string,
  token: string,
  sessionId: string,
  signal: AbortSignal,
): Promise<number | null> {
  try {
    const res = await fetch(
      `${origin}/eve/v1/session/${sessionId}/stream?startIndex=0&includeTailIndex=1`,
      { headers: { authorization: `Bearer ${token}` }, signal },
    );
    const header = res.headers.get('x-eve-stream-tail-index');
    await res.body?.cancel();
    if (!res.ok) {
      console.error('agent.tail_index_failed', { sessionId, status: res.status });
      return null;
    }
    if (header === null || header.trim() === '') {
      console.error('agent.tail_index_missing', { sessionId });
      return null;
    }
    const parsed = Number(header);
    if (!Number.isInteger(parsed)) {
      console.error('agent.tail_index_invalid', { sessionId });
      return null;
    }
    return parsed;
  } catch (err) {
    console.error('agent.tail_index_error', {
      sessionId,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function followTurn(
  origin: string,
  token: string,
  sessionId: string,
  startIndex: number,
  signal: AbortSignal,
): Promise<TurnResult> {
  try {
    const res = await fetch(
      `${origin}/eve/v1/session/${sessionId}/stream?startIndex=${startIndex}`,
      { headers: { authorization: `Bearer ${token}` }, signal },
    );
    if (!res.ok || !res.body) {
      console.error('agent.stream_rejected', { sessionId, status: res.status });
      return { ok: false, reason: 'stream_failed', sessionId };
    }

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
    return { ok: false, reason: signal.aborted ? 'timeout' : 'stream_failed', sessionId };
  }
}
