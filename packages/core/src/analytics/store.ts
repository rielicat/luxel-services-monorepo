import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { mirrorToPostHog } from './posthog';

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
  posthogCaptured?: boolean;
}

export async function recordEvent(e: EventInput): Promise<void> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { error } = await supabase.from('analytics_events').insert({
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
    if (error) console.error('analytics.write_failed', { event: e.event, message: error.message });
  } catch (err) {
    console.error('analytics.write_threw', {
      event: e.event,
      message: err instanceof Error ? err.message : 'unknown',
    });
  }

  if (e.posthogCaptured) return;

  try {
    await mirrorToPostHog(e);
  } catch (err) {
    console.error('analytics.mirror_failed', {
      event: e.event,
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
}
