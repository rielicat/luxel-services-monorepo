import 'server-only';
import type { EventName } from './events';
import { recordEvent } from './store';

/**
 * Fire-and-forget server-side capture for trustworthy revenue and conversion
 * events (bookings, payments, AI tool calls) that must not depend on a browser
 * or survive ad-blockers. Writes to our OWNED store (analytics_events) and, if
 * configured, mirrors to PostHog. Never throws.
 */
export async function capture(
  event: EventName | string,
  distinctId: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  // In-house store (source of truth for the operator dashboard).
  void recordEvent({ event, distinctId, properties, source: 'server' });

  // Optional mirror to PostHog.
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
  } catch {
    // swallow — analytics is best-effort
  }
}
