import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { encryptPII, decryptPII } from '@/lib/crypto/pii';
import { providerApiKey } from './credentials';
import type { ChannelListing, ChannelReservation, ReservationState } from './types';

/**
 * Hospitable Public API v2 client — the CURRENT provider adapter.
 *
 * Deliberately still named for the vendor it speaks to: the wire format, the
 * base URL and every field shape below are Hospitable's. Generic names on a
 * vendor-specific client are how a codebase ends up claiming one thing and
 * doing another. Provider-neutral naming belongs on the seams around it —
 * PROVIDER_API_KEY, the plugin registry — not here.
 *
 * The operator credential resolves through providerApiKey(); a per-customer
 * token in channel_connections takes precedence and marks that customer as
 * own-scope. Shapes verified against the live API (2026-07).
 */

const BASE = 'https://public.api.hospitable.com/v2';

export interface HospitableChannelListing {
  platform: string | null;
  platform_id?: string | null;
  /** The channel-side host id this listing belongs to (Airbnb user id). */
  platform_user_id?: string | null;
  platform_name?: string | null;
  /** The host's channel account email. `pat:read` scope only — present with
   *  Luxel's operator token, and the key that attributes a listing to a client. */
  platform_email?: string | null;
}

export interface HospitableProperty {
  id: string;
  listings?: HospitableChannelListing[];
  name: string | null;
  public_name: string | null;
  picture?: string | null;
  address: {
    number?: string | null;
    street: string | null;
    city: string | null;
    state: string | null;
    postcode?: string | null;
    country?: string | null;
    country_name?: string | null;
    coordinates?: { latitude: string | number | null; longitude: string | number | null } | null;
    display?: string | null;
  } | null;
  timezone?: string | null;
  listed: boolean;
  currency?: string | null;
  summary?: string | null;
  description?: string | null;
  checkin?: string | null;
  checkout?: string | null;
  amenities?: string[] | null;
  capacity: {
    max: number | null;
    bedrooms: number | null;
    beds?: number | null;
    bathrooms: number | null;
  } | null;
  property_type?: string | null;
  room_type?: string | null;
  house_rules?: {
    pets_allowed?: boolean | null;
    smoking_allowed?: boolean | null;
    events_allowed?: boolean | null;
  } | null;
  /** `include=details`. Free text the host wrote for guests, wifi included —
   *  mirrored for the AI's context and never echoed into a thread by us. */
  details?: HospitableListingDetails | null;
  calendar_restricted?: boolean | null;
}

export interface HospitableListingDetails {
  space_overview?: string | null;
  guest_access?: string | null;
  house_manual?: string | null;
  other_details?: string | null;
  additional_rules?: string | null;
  neighborhood_description?: string | null;
  getting_around?: string | null;
  wifi_name?: string | null;
  wifi_password?: string | null;
}

export interface HospitableReservation {
  id: string;
  code: string;
  platform: string | null;
  arrival_date: string;
  departure_date: string;
  /** Full timestamps carrying the listing's times, e.g. 2026-08-04T15:00:00-04:00. */
  check_in?: string | null;
  check_out?: string | null;
  status: string | null;
  reservation_status?: { current?: { category?: string | null } | null } | null;
  guests?: { total?: number | null } | null;
  conversation_id?: string | null;
  /** ISO 639-1 of the thread, as Airbnb reports it. */
  conversation_language?: string | null;
  /** `include=guest`. The language decides which copy the guest receives and
   *  which language their check-in page opens in. */
  guest?: {
    id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    language?: string | null;
    phone_numbers?: string[] | null;
  } | null;
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
    // A 2xx whose body doesn't carry the expected `data` array is a failure, not
    // an empty result — the strict-mirror prune must never run off a fluke body.
    if (!Array.isArray(json.data)) return { ok: false };
    return { ok: true, data: json.data, nextUrl: json.links?.next ?? null };
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

/** Complete-or-nothing: the result feeds the strict-mirror prune, so a partial
 *  list (a failed later page, or the page cap hit with more remaining) must
 *  return null — never a truncated array that would delete the missing tail. */
export async function listHospitableProperties(
  token: string,
): Promise<HospitableProperty[] | null> {
  const out: HospitableProperty[] = [];
  // `include=listings` carries platform_user_id / platform_email per channel —
  // how a listing in the central account is attributed to a host client.
  // `details` is the host's guest-facing text (wifi, access, rules) for the AI.
  let url: string | null = '/properties?per_page=100&include=listings,details';
  for (let page = 0; url && page < 10; page++) {
    const r: Awaited<ReturnType<typeof hospGet<HospitableProperty>>> = await hospGet(token, url);
    if (!r.ok) return null;
    out.push(...(r.data ?? []));
    url = r.nextUrl ?? null;
  }
  if (url) return null; // page cap reached with more pages left → incomplete
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
    `/reservations?properties%5B%5D=${encodeURIComponent(propertyId)}&start_date=${startDate}&end_date=${endDate}&per_page=100&include=guest`;
  for (let page = 0; url && page < 10; page++) {
    const r: Awaited<ReturnType<typeof hospGet<HospitableReservation>>> = await hospGet(token, url);
    // Any page failing means the set is incomplete. Returning a partial list
    // would read as "these are all the reservations", and callers prune against
    // it — a half-read page would revoke live guests' check-in links.
    if (!r.ok) return null;
    out.push(...(r.data ?? []));
    url = r.nextUrl ?? null;
  }
  return out;
}

export interface HospitableCalendarDay {
  date: string;
  day?: string | null;
  min_stay?: number | null;
  closed_for_checkin?: boolean | null;
  closed_for_checkout?: boolean | null;
  status?: {
    reason?: string | null;
    source_type?: string | null;
    available?: boolean | null;
  } | null;
  price?: { amount?: number | null; currency?: string | null; formatted?: string | null } | null;
}

/** The listing's REAL calendar — per-night published price and availability as
 *  Airbnb has it (shape captured live 2026-07; price.amount arrives in cents).
 *  Returns null on any failure so callers degrade instead of inventing data. */
export async function listHospitableCalendar(
  token: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<HospitableCalendarDay[] | null> {
  try {
    const res = await fetch(
      `${BASE}/properties/${encodeURIComponent(propertyId)}/calendar?start_date=${startDate}&end_date=${endDate}`,
      { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: HospitableCalendarDay[] | { days?: HospitableCalendarDay[] };
    };
    const days = Array.isArray(json.data) ? json.data : (json.data?.days ?? null);
    return Array.isArray(days) ? days : null;
  } catch {
    return null;
  }
}

export interface HospitableMessage {
  id: string;
  body: string | null;
  sender_type: string | null; // 'guest' | 'host' | 'teammate' | ...
  created_at: string;
  conversation_id?: string | null;
  reservation_id?: string | null;
  sender?: { first_name?: string | null; full_name?: string | null } | null;
}

/** Full message thread of a reservation (shape verified live 2026-07). */
export async function listHospitableMessages(
  token: string,
  reservationId: string,
): Promise<HospitableMessage[] | null> {
  const out: HospitableMessage[] = [];
  let url: string | null =
    `/reservations/${encodeURIComponent(reservationId)}/messages?per_page=100`;
  for (let page = 0; url && page < 10; page++) {
    const r: Awaited<ReturnType<typeof hospGet<HospitableMessage>>> = await hospGet(token, url);
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

/**
 * Vendor shape → the provider-agnostic contract.
 *
 * Only what the provider-neutral machinery reads (`./relink.ts`). The mirror
 * itself still consumes the raw shapes directly, because a Hospitable property
 * carries far more than any contract should pretend every provider has.
 */
export function toChannelListing(rp: HospitableProperty): ChannelListing {
  const airbnb = (rp.listings ?? []).find((l) => l.platform === 'airbnb' && l.platform_email);
  return {
    ref: { provider: 'hospitable', id: rp.id },
    name: rp.name ?? rp.public_name ?? null,
    hostEmail: airbnb?.platform_email?.trim().toLowerCase() ?? null,
  };
}

function toState(r: HospitableReservation): ReservationState {
  const raw = String(r.reservation_status?.current?.category ?? r.status ?? '').toLowerCase();
  if (['accepted', 'active', 'confirmed'].includes(raw)) return 'confirmed';
  if (raw.includes('cancel') || raw.includes('denied')) return 'cancelled';
  if (raw.includes('request') || raw.includes('pending')) return 'pending';
  return 'unknown';
}

export function toChannelReservation(
  r: HospitableReservation,
  listingId: string,
): ChannelReservation {
  return {
    ref: { provider: 'hospitable', id: r.id },
    listingRef: { provider: 'hospitable', id: listingId },
    arrivalDate: r.arrival_date.slice(0, 10),
    departureDate: r.departure_date.slice(0, 10),
    state: toState(r),
    confirmationCode: r.code || null,
  };
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

/**
 * The customer's OWN Hospitable token, or null — NO env fallback, no decrypt
 * fallthrough. This is the ONLY resolver allowed on paths that prune the
 * property mirror (page-load reconcile, full syncs): the env founder token must
 * never be applied to another tenant's rows, or their data would be replaced by
 * the founder's account and pruned away.
 */
export async function customerHospitableToken(customerId: string): Promise<string | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('channel_connections')
    .select('token_enc')
    .eq('customer_id', customerId)
    .eq('provider', 'hospitable')
    .eq('status', 'connected')
    .maybeSingle();
  if (!data?.token_enc) return null;
  try {
    return decryptPII(data.token_enc as string);
  } catch {
    return null;
  }
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
  return providerApiKey();
}
