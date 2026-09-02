import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { recordEvent } from '@/lib/analytics/store';

type LeadSource = 'chat_handoff' | 'newsletter' | 'contact';

interface LeadInput {
  source: LeadSource;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  commune?: string | null;
  message?: string | null;
  sessionId?: string | null;
  customerId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function createLead(input: LeadInput): Promise<{ ok: boolean; id?: string }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('leads')
      .insert({
        source: input.source,
        name: input.name ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        commune: input.commune ?? null,
        message: input.message ?? null,
        session_id: input.sessionId ?? null,
        customer_id: input.customerId ?? null,
        metadata: input.metadata ?? null,
      })
      .select('id')
      .single();
    if (error || !data) return { ok: false };

    void recordEvent({
      event: 'lead_captured',
      sessionId: input.sessionId ?? null,
      customerId: input.customerId ?? null,
      properties: { source: input.source, commune: input.commune },
      source: 'server',
    });
    return { ok: true, id: data.id };
  } catch {
    return { ok: false };
  }
}
