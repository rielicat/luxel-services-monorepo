import 'server-only';
import type { EventName } from './events';
import { recordEvent } from './store';

export async function capture(
  event: EventName | string,
  distinctId: string,
  properties: Record<string, unknown> = {},
  options: { customerId?: string | null } = {},
): Promise<void> {
  await recordEvent({
    event,
    distinctId,
    customerId: options.customerId ?? null,
    properties,
    source: 'server',
  });
}
