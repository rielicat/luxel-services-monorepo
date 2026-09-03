import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';

const PROPERTY_SELECT =
  'id, nickname, address, comuna, guest_info, guest_context, external_listing_id, platform, ai_replies, price_optimization_enabled, pricelabs_status, ' +
  'bedrooms, bathrooms, picture_url, max_guests, beds, property_type, room_type, checkin_time, checkout_time, listed, amenities, house_rules, ' +
  'calendar_blocks(id, starts_on, ends_on, source, origin, summary, confirmation_code)';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(p: any) {
  const pa = p.property_access;
  return {
    ...p,
    property_access: Array.isArray(pa) ? (pa[0] ?? null) : pa,
    calendar_blocks: p.calendar_blocks ?? [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchProperties(customerId: string): Promise<any[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('properties')
    .select(PROPERTY_SELECT)
    .eq('owner_id', customerId)
    .order('created_at', { ascending: true });
  return (data ?? []).map(normalize);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchProperty(customerId: string, propertyId: string): Promise<any | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('properties')
    .select(PROPERTY_SELECT)
    .eq('owner_id', customerId)
    .eq('id', propertyId)
    .maybeSingle();
  return data ? normalize(data) : null;
}

export interface HostConnection {
  provider: string;
  status: string;
  account_label: string | null;
  last_synced_at: string | null;
  messages_synced_at: string | null;
  has_token: boolean;
}

export async function fetchConnection(customerId: string): Promise<HostConnection | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('channel_connections')
    .select('provider, status, account_label, last_synced_at, messages_synced_at, token_enc')
    .eq('customer_id', customerId)
    .eq('provider', 'hospitable')
    .maybeSingle();
  if (!data) return null;
  const { token_enc, ...rest } = data as Record<string, unknown>;
  return { ...(rest as Omit<HostConnection, 'has_token'>), has_token: Boolean(token_enc) };
}
