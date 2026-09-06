import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { toE164Digits } from '../phone';

export type CrewClient = ReturnType<typeof createSupabaseServiceRoleClient>;
export type CrewRole = 'cleaning' | 'concierge';

export const CREW_ROLES: readonly CrewRole[] = ['cleaning', 'concierge'];

export interface CrewRecipient {
  contactId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
}

interface ContactRow {
  id: string;
  name: string | null;
  email: string | null;
  whatsapp: string | null;
}

function db(client?: CrewClient): CrewClient {
  return client ?? createSupabaseServiceRoleClient();
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length ? trimmed : null;
}

export async function recipients(
  propertyId: string,
  role: CrewRole,
  client?: CrewClient,
): Promise<CrewRecipient[]> {
  const { data, error } = await db(client)
    .from('property_contacts')
    .select('id, name, email, whatsapp')
    .eq('property_id', propertyId)
    .eq('role', role)
    .order('name', { ascending: true });
  if (error) {
    console.warn('crew.recipients_query_failed', { propertyId, role, message: error.message });
    return [];
  }

  const out: CrewRecipient[] = [];
  const seen = new Set<string>();
  for (const row of (data ?? []) as unknown as ContactRow[]) {
    const phone = toE164Digits(row.whatsapp);
    const email = cleanText(row.email);
    if (!phone && !email) continue;
    const key = phone ? `p:${phone}` : `e:${email!.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ contactId: row.id, name: cleanText(row.name), phone, email });
  }
  return out;
}
