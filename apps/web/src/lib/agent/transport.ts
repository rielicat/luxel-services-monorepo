import { messageDelta, requestedHandoff, resultWidget } from '@luxel/core/agent/stream';

export interface AgentCredentials {
  token: string;
  principalId: string;
  signedIn: boolean;
}

export interface TurnHandlers {
  onText: (delta: string) => void;
  onWorking: (working: boolean) => void;
  onWidget: (widget: Record<string, unknown>) => void;
  onDone: (handoff: boolean) => void;
  onError: () => void;
}

export async function openAgent(webSessionId: string): Promise<AgentCredentials | null> {
  const res = await fetch('/api/agent/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ webSessionId }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { ok?: boolean } & Partial<AgentCredentials>;
  if (!data.ok || !data.token || !data.principalId) return null;
  return { token: data.token, principalId: data.principalId, signedIn: Boolean(data.signedIn) };
}

export async function startAgentSession(
  message: string,
  webSessionId: string,
): Promise<{ sessionId: string; token: string } | null> {
  const res = await fetch('/api/agent/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, webSessionId }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { ok?: boolean; sessionId?: string; token?: string };
  if (!data.ok || !data.sessionId || !data.token) return null;
  return { sessionId: data.sessionId, token: data.token };
}

async function tailIndex(sessionId: string, token: string): Promise<number> {
  try {
    const res = await fetch(`/eve/v1/session/${sessionId}/stream?startIndex=0&includeTailIndex=1`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const header = res.headers.get('x-eve-stream-tail-index');
    await res.body?.cancel();
    const parsed = Number(header);
    return Number.isFinite(parsed) ? parsed : -1;
  } catch {
    return -1;
  }
}

export async function sendAgentMessage(
  sessionId: string,
  token: string,
  message: string,
): Promise<number | null> {
  const from = (await tailIndex(sessionId, token)) + 1;
  const res = await fetch(`/eve/v1/session/${sessionId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ message }),
  });
  return res.ok ? from : null;
}

export async function followAgentTurn(
  sessionId: string,
  token: string,
  startIndex: number,
  handlers: TurnHandlers,
): Promise<void> {
  let handoff = false;
  try {
    const res = await fetch(`/eve/v1/session/${sessionId}/stream?startIndex=${startIndex}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok || !res.body) {
      handlers.onError();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
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
        const data = event.data ?? {};

        if (event.type === 'message.appended') {
          const delta = messageDelta(data);
          if (delta) {
            handlers.onWorking(false);
            handlers.onText(delta);
          }
        } else if (event.type === 'actions.requested') {
          if (requestedHandoff(data)) handoff = true;
          handlers.onWorking(true);
        } else if (event.type === 'action.result') {
          handlers.onWorking(false);
          const widget = resultWidget(data);
          if (widget) handlers.onWidget(widget);
        } else if (event.type === 'turn.completed') {
          await reader.cancel();
          handlers.onDone(handoff);
          return;
        } else if (event.type === 'turn.failed' || event.type === 'session.failed') {
          await reader.cancel();
          handlers.onError();
          return;
        }
      }
    }
    handlers.onDone(handoff);
  } catch {
    handlers.onError();
  }
}
