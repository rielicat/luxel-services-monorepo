import { appUrl } from '@luxel/core/urls';
import type { Caller } from './caller';

export interface BridgeResult {
  content: string;
  widget?: Record<string, unknown>;
  handoff?: boolean;
}

const FAILURE: BridgeResult = {
  content:
    'La herramienta no está disponible en este momento. Continúa la conversación sin ese dato y no inventes cifras.',
};

export async function callTool(
  tool: string,
  input: Record<string, unknown>,
  caller: Caller,
): Promise<BridgeResult> {
  const token = process.env.INTERNAL_SEND_TOKEN;
  if (!token) return FAILURE;

  try {
    const res = await fetch(`${appUrl()}/api/agent/tools`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-luxel-internal-token': token },
      body: JSON.stringify({
        tool,
        input,
        surface: caller.surface,
        customerId: caller.customerId,
        signedIn: caller.signedIn,
        sessionId: caller.principalId,
        propertyId: caller.propertyId,
        threadId: caller.threadId,
      }),
    });
    if (!res.ok) {
      console.error('agent.bridge_failed', { tool, status: res.status });
      return FAILURE;
    }
    return (await res.json()) as BridgeResult;
  } catch (err) {
    console.error('agent.bridge_error', {
      tool,
      message: err instanceof Error ? err.message : String(err),
    });
    return FAILURE;
  }
}
