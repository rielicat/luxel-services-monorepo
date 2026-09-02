import 'server-only';
import type { EventName } from './events';
import { recordEvent } from './store';

export async function capture(
  event: EventName | string,
  distinctId: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  void recordEvent({ event, distinctId, properties, source: 'server' });

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
  try {
    await fetch(`${host}/i/v0/e/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $lib: 'luxel-server' },
        timestamp: new Date().toISOString(),
      }),
      cache: 'no-store',
      keepalive: true,
    });
  } catch {}
}
