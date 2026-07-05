import 'server-only';
import { createHash } from 'crypto';
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
  ip?: string | null;
  source?: 'web' | 'server' | 'whatsapp';
}

/** One-way hash so we can count uniques without storing raw IPs. */
function hashIp(ip?: string | null): string | null {
  if (!ip) return null;
  const salt = process.env.LUXEL_ANALYTICS_SALT ?? 'luxel-analytics';
  return createHash('sha256').update(`${ip}:${salt}`).digest('hex').slice(0, 32);
}

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
      ip_hash: hashIp(e.ip),
      source: e.source ?? 'web',
    });
  } catch {
    // best-effort
  }
}
