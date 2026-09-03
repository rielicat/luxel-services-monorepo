import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';

interface EventInput {
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
  } catch {}
}
