import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export interface EventInput {
  event: string;
  distinctId?: string | null;
  anonId?: string | null;
  sessionId?: string | null;
  customerId?: string | null;
  path?: string | null;
  referrer?: string | null;
  utm?: Record<string, string> | null;
  properties?: Record<string, unknown> | null;
  userAgent?: string | null;
  country?: string | null;
  source?: 'web' | 'server' | 'whatsapp';
}

/*
 * Visitor IPs are not collected, hashed or stored.
 *
 * They used to be salted-hashed into analytics_events.ip_hash, which nothing
 * ever read — write-only data derived from personal information. A truncated
 * SHA-256 of an IPv4 address is reversible by brute force anyway (the whole
 * space is 2^32), so the hash was not the protection it looked like. The
 * minimising fix is to stop taking the IP at all rather than to salt it better.
 */

/**
 * Record an event into our owned store (analytics_events). Never throws —
 * monitoring must not break the request that triggered it.
 */
export async function recordEvent(e: EventInput): Promise<void> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    await supabase.from('analytics_events').insert({
      event: e.event.slice(0, 80),
      distinct_id: e.distinctId ?? null,
      anon_id: e.anonId ?? null,
      session_id: e.sessionId ?? null,
      customer_id: e.customerId ?? null,
      path: e.path ?? null,
      referrer: e.referrer ? e.referrer.slice(0, 500) : null,
      utm: e.utm ?? null,
      properties: e.properties ?? null,
      user_agent: e.userAgent ? e.userAgent.slice(0, 300) : null,
      country: e.country ?? null,
      source: e.source ?? 'web',
    });
  } catch {
    // best-effort
  }
}
