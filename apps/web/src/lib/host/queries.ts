import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

const PROPERTY_SELECT =
  'id, nickname, address, comuna, guest_info, external_listing_id, platform, base_nightly_clp, ai_enabled, price_optimization_enabled, pricelabs_status, ' +
  'bedrooms, bathrooms, picture_url, max_guests, beds, property_type, room_type, checkin_time, checkout_time, listed, amenities, house_rules, ' +
  'cleaning_managed_by, cleaning_auto_confirm, ' +
  'property_contacts(id, role, name, email, whatsapp), ' +
  'property_addons(addon, status), ' +
  'property_access(method, require_id, keyless_code, keyless_instructions, concierge_name, concierge_hours, id_basis, id_disclosed, unit), ' +
  'calendar_blocks(id, starts_on, ends_on, source, summary), ' +
  'cleanings(id, cleaning_date, status, price_clp, source, crew_confirmed_at), ' +
  'guest_threads(id, status, guest_name, updated_at, guest_messages(id, direction, source, body, created_at))';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(p: any) {
  const pa = p.property_access;
  return {
    ...p,
    property_access: Array.isArray(pa) ? (pa[0] ?? null) : pa,
    calendar_blocks: p.calendar_blocks ?? [],
    cleanings: p.cleanings ?? [],
    property_contacts: p.property_contacts ?? [],
    property_addons: p.property_addons ?? [],
    guest_threads: p.guest_threads ?? [],
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
