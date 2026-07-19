import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { encryptPII, decryptPII } from '@/lib/crypto/pii';

/**
 * Hospitable Public API v2 client. SaaS model: each host connects their OWN
 * Hospitable account with a Personal Access Token, stored encrypted per customer
 * in channel_connections (env HOSPITABLE_API_TOKEN is only a founder/dev
 * fallback). Shapes verified against the live API (2026-07).
 */

const BASE = 'https://public.api.hospitable.com/v2';

export interface HospitableProperty {
  id: string;
  name: string | null;
  public_name: string | null;
  address: {
    street: string | null;
    city: string | null;
    state: string | null;
    coordinates?: { latitude: string | number | null; longitude: string | number | null } | null;
  } | null;
  capacity: { bedrooms: number | null; bathrooms: number | null; max: number | null } | null;
  listed: boolean;
}

export interface HospitableReservation {
  id: string;
  code: string;
  platform: string | null;
  arrival_date: string;
  departure_date: string;
  status: string | null;
  reservation_status?: { current?: { category?: string | null } | null } | null;
  guests?: { total?: number | null } | null;
  conversation_id?: string | null;
}

async function hospGet<T>(
  token: string,
  path: string,
): Promise<{ ok: boolean; data?: T[]; nextUrl?: string | null }> {
  try {
    const res = await fetch(path.startsWith('http') ? path : `${BASE}${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    });
    if (!res.ok) return { ok: false };
    const json = (await res.json()) as { data?: T[]; links?: { next?: string | null } };
    return { ok: true, data: json.data ?? [], nextUrl: json.links?.next ?? null };
  } catch {
    return { ok: false };
  }
}

/** Validates a token by listing properties. Returns the account's property count. */
export async function verifyHospitableToken(
  token: string,
): Promise<{ ok: boolean; properties?: number; firstName?: string | null }> {
  const r = await hospGet<HospitableProperty>(token, '/properties?per_page=100');
  if (!r.ok) return { ok: false };
  return {
    ok: true,
    properties: r.data!.length,
    firstName: r.data![0]?.public_name ?? r.data![0]?.name ?? null,
  };
}

export async function listHospitableProperties(
  token: string,
): Promise<HospitableProperty[] | null> {
  const out: HospitableProperty[] = [];
  let url: string | null = '/properties?per_page=100';
  for (let page = 0; url && page < 10; page++) {
    const r: Awaited<ReturnType<typeof hospGet<HospitableProperty>>> = await hospGet(token, url);
    if (!r.ok) return page === 0 ? null : out;
    out.push(...(r.data ?? []));
    url = r.nextUrl ?? null;
  }
  return out;
}

export async function listHospitableReservations(
  token: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<HospitableReservation[] | null> {
  const out: HospitableReservation[] = [];
  let url: string | null =
    `/reservations?properties%5B%5D=${encodeURIComponent(propertyId)}&start_date=${startDate}&end_date=${endDate}&per_page=100`;
  for (let page = 0; url && page < 10; page++) {
    const r: Awaited<ReturnType<typeof hospGet<HospitableReservation>>> = await hospGet(token, url);
    if (!r.ok) return page === 0 ? null : out;
    out.push(...(r.data ?? []));
    url = r.nextUrl ?? null;
  }
  return out;
}

/** Sends a message into a reservation's guest thread. Returns a message id-ish, or null. */
export async function sendHospitableMessage(
  token: string,
  reservationId: string,
  body: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/reservations/${reservationId}/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as { data?: { id?: string } };
    return json.data?.id ?? `hosp_${Date.now()}`;
  } catch {
    return null;
  }
}

/** Stores a customer's token encrypted. */
export async function saveHospitableConnection(
  customerId: string,
  token: string,
  accountLabel: string | null,
): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('channel_connections').upsert(
    {
      customer_id: customerId,
      provider: 'hospitable',
      token_enc: encryptPII(token),
      account_label: accountLabel,
      status: 'connected',
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'customer_id,provider' },
  );
  return !error;
}

/** Resolves the customer's Hospitable token (decrypted), else the env fallback. */
export async function hospitableTokenForCustomer(
  customerId: string | null,
): Promise<string | null> {
  if (customerId) {
    const supabase = createSupabaseServiceRoleClient();
    const { data } = await supabase
      .from('channel_connections')
      .select('token_enc')
      .eq('customer_id', customerId)
      .eq('provider', 'hospitable')
      .eq('status', 'connected')
      .maybeSingle();
    if (data?.token_enc) {
      try {
        return decryptPII(data.token_enc as string);
      } catch {
        /* fall through to env */
      }
    }
  }
  return process.env.HOSPITABLE_API_TOKEN ?? null;
}
