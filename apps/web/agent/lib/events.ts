import { appUrl } from '@luxel/core/urls';

export type AgentEvent =
  | {
      kind: 'web_message';
      sessionId: string;
      customerId: string | null;
      distinctId: string;
      direction: 'in' | 'out';
      body: string;
      handoff?: boolean;
    }
  | {
      kind: 'lead';
      sessionId: string | null;
      customerId: string | null;
      message: string | null;
    }
  | { kind: 'tool_called'; distinctId: string; sessionId: string; tool: string };

export async function emit(event: AgentEvent): Promise<void> {
  const token = process.env.INTERNAL_SEND_TOKEN;
  if (!token) return;
  try {
    const res = await fetch(`${appUrl()}/api/agent/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-luxel-internal-token': token },
      body: JSON.stringify(event),
    });
    if (!res.ok) console.error('agent.event_failed', { kind: event.kind, status: res.status });
  } catch (err) {
    console.error('agent.event_error', {
      kind: event.kind,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
