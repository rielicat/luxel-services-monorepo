export const HANDOFF_TOOLS = new Set(['escalate_to_luxel', 'escalate_to_human']);

export function calledTools(data: unknown): string[] {
  const actions = (data as { actions?: unknown } | null)?.actions;
  if (!Array.isArray(actions)) return [];
  const names: string[] = [];
  for (const action of actions) {
    const name = (action as { toolName?: unknown } | null)?.toolName;
    if (typeof name === 'string') names.push(name);
  }
  return names;
}

export function requestedHandoff(data: unknown): boolean {
  return calledTools(data).some((name) => HANDOFF_TOOLS.has(name));
}

export const SEARCH_TOOLS = new Set(['web_search', 'web_fetch']);

export function usedWebSearch(data: unknown): boolean {
  return calledTools(data).some((name) => SEARCH_TOOLS.has(name));
}

export function resultWidget(data: unknown): Record<string, unknown> | null {
  const output = (data as { result?: { output?: unknown } } | null)?.result?.output;
  const widget = (output as { widget?: unknown } | null)?.widget;
  return widget && typeof widget === 'object' ? (widget as Record<string, unknown>) : null;
}

export function finalMessage(data: unknown): string | null {
  const payload = data as { message?: unknown; finishReason?: unknown } | null;
  if (payload?.finishReason !== 'stop') return null;
  return typeof payload.message === 'string' ? payload.message : null;
}

export function messageDelta(data: unknown): string {
  const delta = (data as { messageDelta?: unknown } | null)?.messageDelta;
  return typeof delta === 'string' ? delta : '';
}

export function receivedMessage(data: unknown): string {
  const message = (data as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : '';
}
