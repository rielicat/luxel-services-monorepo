import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { recordEvent } from '@/lib/analytics/store';

export type LeadSource = 'out_of_area' | 'chat_handoff' | 'quote' | 'newsletter' | 'contact';

export interface LeadInput {
  source: LeadSource;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  commune?: string | null;
  serviceSlug?: string | null;
  squareMeters?: number | null;
  quoteAmountClp?: number | null;
  addressLine?: string | null;
  lat?: number | null;
  lng?: number | null;
  message?: string | null;
  sessionId?: string | null;
  customerId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Persist a lead (unconverted contact intent) and log a lead_captured event. */
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
        service_slug: input.serviceSlug ?? null,
        square_meters: input.squareMeters ?? null,
        quote_amount_clp: input.quoteAmountClp ?? null,
        address_line: input.addressLine ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
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
      properties: { source: input.source, commune: input.commune, service_slug: input.serviceSlug },
      source: 'server',
    });
    return { ok: true, id: data.id };
  } catch {
    return { ok: false };
  }
}
